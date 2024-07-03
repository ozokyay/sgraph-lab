import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { GraphConfiguration, GraphInstance, EmptyInstance, EmptyDefinition } from './graph-configuration';
import { AdjacencyList, Edge, EdgeList, Node } from './graph';
import { Cluster } from './cluster';
import { LocalService } from './local.service';
import { Utility } from './utility';
import Rand from 'rand-seed';
import { ClusterConnection } from './cluster-connection';

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

  public measures = new BehaviorSubject<GraphInstance>(EmptyInstance); // This is just for slow measures, can publish degree distribution immediately
  public selectedCluster = new BehaviorSubject<Cluster | undefined>(undefined);
  public selectedConnections = new BehaviorSubject<Edge[]>([]);
  public history = new BehaviorSubject<GraphConfiguration[]>([this.configuration.value]);

  constructor(private local: LocalService) {}
   
  public update(message: string) {
    // Build graph
    this.configuration.value.message = message;
    this.build(this.configuration.value, false);

    // TODO: Compute fast measures immediately
    
    
    // Track history without instance
    this.trackHistory(message);

    // Publish
    this.configuration.next(this.configuration.value);

    // Start async measure computation
    // Per cluster
    // Global
    // Can do fast measures before
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
        configuration.instance.connections.set(edge.data, this.generateConnection(edge));
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
    const connection: ClusterConnection = edge.data!;
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
    combinations.sort((a, b) => (a.data - b.data) * Math.sign(connection.degreeAssortativity));
    finalEdges.push(...combinations.slice(0, assortative));

    return finalEdges.slice(0, edges);
  }

  private updateInstance(change: string, config: GraphConfiguration) {
    // Generate graph according to config
    // Merge into instance according to change type (if seed is unchanged)
    // What if multiple changes combined? The current approach is limited

    // Next problem: Inconsistent layout import vs generation
    // But cannot have completely random layout either
    // Won't fix?
    // Solution: Semi-Deterministic Layout-Algorithm?
    // Also makes merging instances redundant?
    // Idea: arange cluster circular based on CLUSTER_ID (this could actually work)
    // Possible problem: Only start state deterministic, effects of connections unpredictable

    // Still: better than nothing, easier to implement, not too much focus on central NL

    // Can still decide to merge instances later if wanted

    // Always reset RNG with seed before building

    // Change types:
    // Add/Update/Remove
    // Node, Edge

    // Graph is always available in parts and gets assembled in the end

    // Actually, the only thing that needs to be merged are nodes of unchanged clusters
    // This is easy: Just retain all unchanged clusters
    // By excluding updated clusters according to change event cluster ID
    
    // Problem: cascade of RNG state
    // Solution: Is full consistency even required?
    // Solution2: RNG state by SEED + CLUSTER_ID for cluster generation
    // Solution2: RNG state by SEED + CLUSTER_ID1 + CLUSTER_ID2 (symmetrical) for connection generation
    // This will ensure full partial graph consistency
  }
}
