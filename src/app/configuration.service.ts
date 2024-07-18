import { Injectable, SimpleChange } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { GraphConfiguration, GraphInstance, EmptyInstance, EmptyDefinition, EmptyMeasures, GraphMeasures } from './graph-configuration';
import { AdjacencyList, Edge, EdgeList, Node } from './graph';
import { Cluster } from './cluster';
import { LocalService } from './local.service';
import { Utility } from './utility';
import Rand from 'rand-seed';
import { ClusterConnection } from './cluster-connection';
import { DefaultGraphics, DefaultLayout, GraphicsSettings, LayoutSettings } from './nl-settings';
import { PythonService } from './python.service';
import { Uniform10 } from './series';

@Injectable({
  providedIn: 'root'
})
export class ConfigurationService {

  // Idea
  // - instead of publishing instance and measures later
  // - publish definition immediately for responsive UI
  // - publish complete configuration later
  // - risk: must ignore inputs inbetween
  // - currently: publish all at once, very slow measures later

  public configuration = new BehaviorSubject<GraphConfiguration>({
    definition: EmptyDefinition,
    instance: EmptyInstance,
    message: "Empty graph"
  });

  public measures = new BehaviorSubject<GraphInstance>(EmptyInstance);
  public selectedCluster = new BehaviorSubject<Cluster | undefined>(undefined);
  public selectedConnections = new BehaviorSubject<Edge[]>([]);
  public selectedDiffusionSeeds = new BehaviorSubject<Set<Node>>(new Set());
  public layoutSettings = new BehaviorSubject<LayoutSettings>(DefaultLayout);
  public graphicsSettings = new BehaviorSubject<GraphicsSettings>(DefaultGraphics);
  public history = new BehaviorSubject<GraphConfiguration[]>([structuredClone(this.configuration.value)]);

  private abort: AbortController = new AbortController();

  constructor(private local: LocalService, private python: PythonService) {

  }
   
  public async update(message: string) {
    this.configuration.value.message = message;
    // Build graph
    let t = performance.now();
    this.build(this.configuration.value, false);
    console.log(`Building graph took ${performance.now() - t} ms`);

    // Compute fast measures immediately
    this.computeFastMeasures();

    // Track history without instance
    this.trackHistory(message);

    // Publish
    this.configuration.next(this.configuration.value);

    // Slow measures
    t = performance.now();
    this.abort.abort();
    this.abort = new AbortController();
    await this.computeSlowMeasures(this.abort.signal);
    console.log(`Slow measures took ${performance.now() - t} ms`);
    this.measures.next(this.measures.value);
  }

  public trackHistory(message: string) {
    console.log(message);
    this.configuration.value.message = message;
    this.history.value.push(structuredClone({
      definition: this.configuration.value.definition,
      instance: EmptyInstance,
      message: this.configuration.value.message
    }));
  }

  public undo() {
    // TODO: CTRL+Y, selection history
    if (this.history.value.length == 1) {
      return;
    }
    this.history.value.pop();
    const latest = this.history.value[this.history.value.length - 1];
    this.history.next(this.history.value);
    this.build(latest, true);
    this.configuration.next(latest);
  }

  private build(configuration: GraphConfiguration, undo: boolean) {
    // Clear instance
    configuration.instance.connections = new Map();
    configuration.instance.graph = new EdgeList();

    // Generate clusters
    if (undo || configuration.message.startsWith("Import")) {
      configuration.instance.clusters = new Map();
      for (const node of configuration.definition.graph.nodes.keys()) {
        Utility.rand = new Rand(configuration.definition.seed.toString() + node.id.toString());
        configuration.instance.clusters.set(node.data as Cluster, this.generateCluster(node));
      }
    } else if (configuration.message.startsWith("Add cluster") ||
        configuration.message.startsWith("Change cluster")) {
      const id = parseInt(configuration.message.split(" ").pop()!);
      const node = configuration.definition.graph.nodeDictionary.get(id)!;
      Utility.rand = new Rand(configuration.definition.seed.toString() + id.toString());
      configuration.instance.clusters.set(node.data as Cluster, this.generateCluster(node));
    } else if (configuration.message.startsWith("Remove cluster")) {
      const id = parseInt(configuration.message.split(" ").pop()!);
      const cluster = [...configuration.instance.clusters.keys()].find(c => c.id == id)!;
      configuration.instance.clusters.delete(cluster);
    }

    // Generate connections
    for (const edges of configuration.definition.graph.nodes.values()) {
      for (const [edge, _] of edges) {
        Utility.rand = new Rand(configuration.definition.seed.toString() + edge.source.id.toString() + (edge.target.id << 16).toString());
        configuration.instance.connections.set(edge.data as ClusterConnection, this.generateConnection(edge));
      }
    }

    // Assemble graph
    for (const instance of configuration.instance.clusters.values()) {
      configuration.instance.graph.nodes = configuration.instance.graph.nodes.concat(instance.nodes);
      configuration.instance.graph.edges = configuration.instance.graph.edges.concat(instance.edges);
    }
    for (const connection of configuration.instance.connections.values()) {
      // Any attributes/IDs wanted here? Can always determine cluster combination from source/target
      configuration.instance.graph.edges = configuration.instance.graph.edges.concat(connection);
    }

    let id = 0;
    for (const node of configuration.instance.graph.nodes) {
      node.id = id;
      id++;
    }
  }

  private generateCluster(node: Node): EdgeList {
    const cluster = node.data as Cluster;
    // Convert series to distribution
    const distribution = Utility.computeDistribution(cluster.degreeDistribution);

    // Convert to node by deg format
    let sum = 0;
    let nodeDegrees: number[] = [];
    for (const p of distribution) {
      if (p.x == 0) {
        continue;
      }
      for (let i = 0; i < p.y; i++) {
        const deg = cluster.generator == "CL" ? p.x : Math.round(p.x);
        nodeDegrees.push(deg);
        sum += deg;
      }
    }
    if (cluster.generator == "CM" && sum % 2 != 0) {
      nodeDegrees.push(1);
    }

    // Run generator
    let g: EdgeList;
    if (cluster.generator == "CL") {
      g = this.local.generateChungLu(nodeDegrees);
    } else {
      g = this.local.generateConfigurationModel(nodeDegrees);
    }
    if (cluster.extractGiantComponent) {
      g = this.local.extractGiantComponent(new AdjacencyList(g));
    }

    for (const n of g.nodes) {
      n.data = {
        clusterID: cluster.id,
        layoutPosition: { x:0, y: 0 },
        attributes: []
      }
    }

    return g;
  }

  private generateConnection(edge: Edge): Edge[] {
    const connection: ClusterConnection = edge.data as ClusterConnection;
    const cluster1: Cluster = edge.source.data as Cluster;
    const cluster2: Cluster = edge.target.data as Cluster;
    const graph1: EdgeList = this.configuration.value.instance.clusters.get(cluster1)!;
    const graph2: EdgeList = this.configuration.value.instance.clusters.get(cluster2)!;
    const count1 = Math.round(connection.nodeCountSource * graph1.nodes.length); // Actually prefer absolute node counts in cluster def - but harder to achieve precisely
    const count2 = Math.round(connection.nodeCountTarget * graph2.nodes.length);
    const degrees1 = Utility.computeNodeDegrees(graph1);
    const degrees2 = Utility.computeNodeDegrees(graph2);
    const buckets1 = Utility.sortNodeDegrees(degrees1);
    const buckets2 = Utility.sortNodeDegrees(degrees2);

    // Degree distribution

    // If null, draw random count nodes (= drawing from actual distribution)
    // If not null, draw according to distribution
    // => Stratify or draw from prepared distribution?
    // => Stratification makes a bit more sense, but is much harder to achieve and not needed rn

    // TODO: Drawing according to given distribution, no computation and multiplication
    // Drawing works simply by
    // - Copy data
    // - Multiply for correct counts
    // - Draw from probability distribution
    // - Repeat if cannot be satisfied (takes too long toward the end?)
    // - Repeat until count satisfied

    // Instead of this, create correct distributions and draw randomly
    // const proportions1 = Utility.computeBiasedProportions(cluster1.degreeDistribution, connection.degreeDistributionSource!);
    // const proportions2 = Utility.computeBiasedProportions(cluster2.degreeDistribution, connection.degreeDistributionTarget!);
    // Utility.multiplyPointValues(proportions1, count1);
    // Utility.multiplyPointValues(proportions2, count2);
    // proportions1.sort((a, b) => b.y - a.y);
    // proportions2.sort((a, b) => b.y - a.y);
    // const nodes1 = Utility.drawProportionally(count1, buckets1, proportions1);
    // const nodes2 = Utility.drawProportionally(count2, buckets2, proportions2);

    let nodes1: Node[] = [...graph1.nodes];
    let nodes2: Node[] = [...graph2.nodes];
    if (connection.degreeDistributionSource == undefined) {
      Utility.shuffleArray(nodes1);
      nodes1 = nodes1.slice(0, count1);
    } else {
      const sum = connection.degreeDistributionSource.data.reduce((a, b) => a + b.y, 0);
      const scaled = [...connection.degreeDistributionSource.data];
      Utility.multiplyPointValues(scaled, count1 / sum);
      nodes1 = Utility.drawProportionally(count1, buckets1, scaled);
    }
    if (connection.degreeDistributionTarget == undefined) {
      Utility.shuffleArray(nodes2);
      nodes2 = nodes2.slice(0, count2);
    } else {
      const sum = connection.degreeDistributionTarget.data.reduce((a, b) => a + b.y, 0);
      const scaled = [...connection.degreeDistributionTarget.data];
      Utility.multiplyPointValues(scaled, count2 / sum);
      nodes2 = Utility.drawProportionally(count2, buckets2, scaled);
    }
    

    // Assortativity
    const candidateDegrees1: number[] = nodes1.map(n => degrees1.get(n)!);
    const candidateDegrees2: number[] = nodes2.map(n => degrees2.get(n)!);
    const combinations: Edge[] = [];
    for (let n1 = 0; n1 < count1; n1++) {
      for (let n2 = 0; n2 < count2; n2++) {
        const distance = Math.abs(candidateDegrees1[n1] - candidateDegrees2[n2]); // Power-law distribution causes low values to be more likely to match than high values
        combinations.push({ source: nodes1[n1], target: nodes2[n2], data: distance });
      }
    }

    const edges = Math.round(connection.edgeCount * Math.min(graph1.edges.length, graph2.edges.length, combinations.length));
    const assortative = Math.round(Math.abs(connection.degreeAssortativity) * edges);
    const random = edges - assortative;
    const finalEdges: Edge[] = [];
    // Take proportion from cobinations
    Utility.shuffleArray(combinations);
    finalEdges.push(...combinations.splice(0, random));
    // Take rest from sorted
    combinations.sort((a, b) => ((a.data as number) - (b.data as number)) * Math.sign(connection.degreeAssortativity));
    finalEdges.push(...combinations.slice(0, assortative));

    return finalEdges.slice(0, edges);
  }

  private computeFastMeasures() {
    const compute = (graph: EdgeList): GraphMeasures => {
      const measures = structuredClone(EmptyMeasures);
      measures.nodeCount = graph.nodes.length;
      measures.edgeCount = graph.edges.length;
      measures.density = Math.round(2 * graph.edges.length / (graph.nodes.length * (graph.nodes.length - 1)) * 1000) / 1000;
      measures.degrees = Utility.computeNodeDegrees(graph);
      measures.degreeDistribution = Utility.getDegreeDistribution(measures.degrees);      
      return measures;
    };

    // Global
    this.configuration.value.instance.globalMeasures = compute(this.configuration.value.instance.graph);

    // Per cluster
    for (const [cluster, graph] of this.configuration.value.instance.clusters) {
      const measures = compute(graph);
      this.configuration.value.instance.clusterMeasures.set(cluster, measures);
    }
  }

  // Must prevent data race
  private async computeSlowMeasures(signal: AbortSignal): Promise<void> {
    const compute = async (graph: EdgeList, measures: GraphMeasures): Promise<GraphMeasures> => {
      measures = {...measures}; // clone again for change detection
      await this.python.setGraph(graph);
      if (signal.aborted) { return measures; }
      measures.clusteringCoefficientDistribution = await this.python.getGraphMeasure("clustering", 20);
      if (signal.aborted) { return measures; }
      measures.clusteringCoefficientDistribution2 = await this.python.getClusteringCoefficientDistribution2();
      if (signal.aborted) { return measures; }
      measures.diameter = await this.python.getDiameter();  
      if (signal.aborted) { return measures; }
      if (!Number.isNaN(measures.diameter)) {
        measures.eigenvectorCentralityDistribution = await this.python.getGraphMeasure("eigenvector_centrality", 20); // Requires connected graph 
      }
      if (signal.aborted) { return measures; }
      measures.degreeAssortativity = await this.python.getSimpleMeasure("degree_assortativity_coefficient");
      measures.degreeAssortativity = Math.round(measures.degreeAssortativity * 100) / 100;
      return measures;
    };

    // Global
    const measures = await compute(this.configuration.value.instance.graph, this.configuration.value.instance.globalMeasures);
    if (signal.aborted) { return; }
    this.configuration.value.instance.globalMeasures = measures;

    // Per cluster
    for (const [cluster, graph] of this.configuration.value.instance.clusters) {
      let measures = this.configuration.value.instance.clusterMeasures.get(cluster)!;
      measures = await compute(graph, measures);
      if (signal.aborted) { return; }
      this.configuration.value.instance.clusterMeasures.set(cluster, measures);
    }
  }
}
