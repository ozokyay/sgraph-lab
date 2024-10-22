import { Injectable, SimpleChange } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { GraphConfiguration, GraphInstance, EmptyInstance, EmptyDefinition, EmptyMeasures, GraphMeasures } from './graph-configuration';
import { AdjacencyList, Edge, EdgeList, Node, NodeData } from './graph';
import { Cluster } from './cluster';
import { LocalService } from './local.service';
import { Utility } from './utility';
import Rand from 'rand-seed';
import { ClusterConnection } from './cluster-connection';
import { DefaultGraphics, DefaultLayout, GraphicsSettings, LayoutSettings } from './nl-settings';
import { PythonService } from './python.service';
import { Uniform10 } from './series';
import { Point } from './point';
import { ForceDirected } from './graphwagu/webgpu/force_directed';

@Injectable({
  providedIn: 'root'
})
export class ConfigurationService {
  public configuration = new BehaviorSubject<GraphConfiguration>({
    definition: EmptyDefinition(),
    instance: EmptyInstance(),
    message: "Empty graph"
  });

  public measures = new BehaviorSubject<GraphInstance>(this.configuration.value.instance);
  public hoveredCluster = new BehaviorSubject<Cluster | undefined>(undefined);
  public selectedCluster = new BehaviorSubject<Cluster | undefined>(undefined);
  public hiddenClusters = new BehaviorSubject<Set<number>>(new Set());
  public selectedConnections = new BehaviorSubject<Edge[]>([]);
  public selectedDiffusionSeeds = new BehaviorSubject<Set<Node>>(new Set());
  public layoutSettings = new BehaviorSubject<LayoutSettings>(DefaultLayout);
  public sample = new BehaviorSubject<EdgeList>({ nodes: [], edges: [] });
  public centroids = new BehaviorSubject<Map<number, Point>>(new Map());
  public forceDirectedLayout = new BehaviorSubject<EdgeList>({ nodes: [], edges: [] });
  public activeTab = new BehaviorSubject<number>(0);
  public history = new BehaviorSubject<GraphConfiguration[]>([structuredClone(this.configuration.value)]);

  private abortMeasures: AbortController = new AbortController();
  private abortLayout: AbortController = new AbortController();
  private layout?: ForceDirected;

  constructor(private python: PythonService) {
    this.initWebGPU();
    this.layoutSettings.subscribe(l => {
      if (l === DefaultLayout) {
        return;
      }
      this.abortLayout.abort();
      this.abortLayout = new AbortController();
      this.runLayout(this.configuration.value.instance.graph, this.layout, this.abortLayout.signal);
    });
  }

  public clear() {
    this.configuration.next({
      definition: EmptyDefinition(),
      instance: EmptyInstance(),
      message: "Empty graph"
    });
    this.measures.next(this.configuration.value.instance);
    this.history.value.splice(0, this.history.value.length);
    this.history.value.push(structuredClone(this.configuration.value));
    this.layoutSettings.next(DefaultLayout);
    // Must clear selection because no history
    this.selectedCluster.next(undefined);
    this.selectedConnections.next([]);
    this.selectedDiffusionSeeds.next(new Set());
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

    // Layout
    this.abortLayout.abort();
    this.abortLayout = new AbortController();
    this.runLayout(this.configuration.value.instance.graph, this.layout, this.abortLayout.signal);

    // Slow measures
    t = performance.now();
    this.abortMeasures.abort();
    this.abortMeasures = new AbortController();
    await this.computeSlowMeasures(this.abortMeasures.signal);
    console.log(`Slow measures took ${performance.now() - t} ms`);
    this.measures.next(this.measures.value);
  }

  public trackHistory(message: string) {
    console.log(message);
    this.configuration.value.message = message;
    this.history.value.push(structuredClone({
      definition: this.configuration.value.definition,
      instance: EmptyInstance(),
      message: this.configuration.value.message
    }));
    this.history.next(this.history.value);
  }

  public undo() {
    // TODO: Must re-create functions lost in structured clone (only defintion graph)
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

    // Main reason for change detection: Layout consistency, quite important
    // Also want it for undo/redo
    // Cluster connections dont really matter
    // The leaf cluster nodes are important to keep because they store their positions

    if (undo || configuration.message.startsWith("Import")) {
      configuration.instance.clusters = new Map();
      for (const node of configuration.definition.graph.nodes.keys()) {
        this.generateAndStoreCluster(configuration, node);
      }
    } else {
      // Change detection for leaf clusters
      const last = this.history.value[this.history.value.length - 1].definition.graph;

      for (const node of configuration.definition.graph.nodes.keys()) {
        const old = last.nodeDictionary.get(node.id);

        const clusterOld = old?.data as Cluster;
        const clusterNew = node.data as Cluster;

        if (clusterOld == undefined || clusterNew.changeUUID !== clusterOld.changeUUID) {
          this.generateAndStoreCluster(configuration, node);
        }
      }

      for (const old of last.nodes.keys()) {
        const node = configuration.definition.graph.nodeDictionary.get(old.id);

        const clusterOld = old.data as Cluster;
        const clusterNew = node?.data as Cluster;

        if (clusterNew == undefined) {
          // Remove
          configuration.instance.clusters.delete(clusterOld.id);
          if (this.selectedCluster.value == clusterOld) {
            this.selectedCluster.next(undefined);
          }
          // Remove from selection
          const indices = this.selectedConnections.value.filter(e => e.source.id == old.id || e.target.id == old.id).map((_, i) => i);
          for (let i = indices.length - 1; i >= 0; i--) {
            this.selectedConnections.value.splice(indices[i], 1);
          }
          if (indices.length > 0) {
            this.selectedConnections.next(this.selectedConnections.value);
          }
        }
      }
    }

    // Clear hierarchy
    for (const node of configuration.definition.graph.nodes.keys()) {
      const cluster = node.data as Cluster;
      if (cluster.children.length == 0 && cluster.generator.name != "MG") {
        continue;
      }
      configuration.instance.clusters.set(cluster.id, { nodes: [], edges: [] });
    }

    // Rebuild hierarchy and build (grand) children list
    const groupChildren = new Map<Node, Node[]>();
    for (const node of configuration.definition.graph.nodes.keys()) {
      if ((node.data as Cluster).children.length > 0) {
        groupChildren.set(node, []);
      }
    }

    for (const node of configuration.definition.graph.nodes.keys()) {
      const cluster = node.data as Cluster;
      if (cluster.children.length > 0) {
        continue;
      }

      // Add to all parents
      const g = configuration.instance.clusters.get(cluster.id)!;
      let parent = configuration.definition.graph.nodeDictionary.get(cluster.parent);
      while (parent != undefined) {
        const c = parent.data as Cluster;
        const graph = configuration.instance.clusters.get(c.id)!;
        graph.nodes.push(...g.nodes);
        graph.edges.push(...g.edges);
        groupChildren.get(parent)!.push(node);
        parent = configuration.definition.graph.nodeDictionary.get(c.parent);
      }
    }

    // Generate connections
    for (const edges of configuration.definition.graph.nodes.values()) {
      for (const [edge, _] of edges) {
        if (configuration.instance.connections.get(edge) != undefined) {
          continue;
        }
        Utility.rand = new Rand(configuration.definition.seed.toString() + edge.source.id.toString() + (edge.target.id << 16).toString());
        configuration.instance.connections.set(edge, this.generateConnection(edge));
      }
    }

    // Build up hierarchy
    for (const [connection, edges] of configuration.instance.connections) {
      for (const [group, children] of groupChildren) {
        if (children.indexOf(connection.source) != -1 && children.indexOf(connection.target) != -1) {
          configuration.instance.clusters.get(group.id)!.edges.push(...edges);
        }
      }
    }


    // Assemble graph
    for (const [cluster, instance] of configuration.instance.clusters) {
      if ((configuration.definition.graph.nodeDictionary.get(cluster)!.data as Cluster).children.length > 0) {
        continue;
      }

      configuration.instance.graph.nodes = configuration.instance.graph.nodes.concat(instance.nodes);
      configuration.instance.graph.edges = configuration.instance.graph.edges.concat(instance.edges);
    }
    for (const connection of configuration.instance.connections.values()) {
      // Any attributes/IDs wanted here? Can always determine cluster combination from source/target
      configuration.instance.graph.edges = configuration.instance.graph.edges.concat(connection);
    }

    // Unique node IDs in final graph
    let id = 0;
    for (const node of configuration.instance.graph.nodes) {
      node.id = id;
      id++;
    }
  }

  private generateCluster(node: Node): EdgeList {
    const cluster = node.data as Cluster;
    let g = cluster.generator.generate();

    for (const n of g.nodes) {
      n.data = {
        clusterID: cluster.id,
        layoutPosition: { x: 0, y: 0 },
        renderPosition: { x: 0, y: 0 },
        samplingID: -1,
        attributes: []
      }
    }

    return g;
  }

  private generateAndStoreCluster(configuration: GraphConfiguration, node: Node) {
    const cluster = node.data as Cluster;
    // Ignore non-leaves
    if (cluster.children.length > 0) {
      return;
    }

    // Add or change
    Utility.rand = new Rand(configuration.definition.seed.toString() + node.id.toString());
    const g = this.generateCluster(node);
    configuration.instance.clusters.set(node.id, g);
  }

  private generateConnection(edge: Edge): Edge[] {
    const connection: ClusterConnection = edge.data as ClusterConnection;
    const cluster1: Cluster = edge.source.data as Cluster;
    const cluster2: Cluster = edge.target.data as Cluster;
    const graph1: EdgeList = this.configuration.value.instance.clusters.get(cluster1.id)!;
    const graph2: EdgeList = this.configuration.value.instance.clusters.get(cluster2.id)!;
    const count1 = Math.round(connection.sourceNodeCount * graph1.nodes.length);
    const count2 = Math.round(connection.targetNodeCount * graph2.nodes.length);
    const degrees1 = Utility.computeNodeDegrees(graph1);
    const degrees2 = Utility.computeNodeDegrees(graph2);
    const degreeArray1 = [...degrees1.entries()];
    const degreeArray2 = [...degrees2.entries()];
    Utility.shuffleArray(degreeArray1);
    Utility.shuffleArray(degreeArray2);
    const buckets1 = Utility.sortNodeDegrees(degreeArray1);
    const buckets2 = Utility.sortNodeDegrees(degreeArray2);

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

    if (connection.sourceDegreeDistribution == undefined) {
      Utility.shuffleArray(nodes1);
      nodes1 = nodes1.slice(0, count1);
    } else {
      const sum = connection.sourceDegreeDistribution.data.reduce((a, b) => a + b.y, 0);
      const scaled = Utility.computeDistribution(connection.sourceDegreeDistribution);

      // TODO: Three things to work out here
      // a) Enough nodes for maxEdges available
      // b) maxEdges accurate (must take away leaves from the recursion parent)
      // c) For some reason, distribution only reflected on low desired node counts -> Correct behavior, but seems unexpected

      Utility.multiplyPointValues(scaled, count1 / sum);
      nodes1 = Utility.drawProportionally(count1, buckets1, scaled);
    }
    if (connection.targetDegreeDistribution == undefined) {
      Utility.shuffleArray(nodes2);
      nodes2 = nodes2.slice(0, count2);
    } else {
      const sum = connection.targetDegreeDistribution.data.reduce((a, b) => a + b.y, 0);
      const scaled = Utility.computeDistribution(connection.targetDegreeDistribution);
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
        const v1 = nodes1[n1];
        const v2 = nodes2[n2];
        const d1 = v1.data as NodeData;
        const d2 = v2.data as NodeData;
        if (d1.clusterID != d2.clusterID) {
          combinations.push({ source: v1, target: v2, data: distance });
        } else {
          // Should get replacement node from parent cluster if available
          // Not implemented
        }
      }
    }

    const assortative = Math.round(Math.abs(connection.degreeAssortativity) * connection.edgeCount);
    const random = connection.edgeCount - assortative;
    const finalEdges: Edge[] = [];
    // Take proportion from cobinations
    Utility.shuffleArray(combinations);
    finalEdges.push(...combinations.splice(0, random));
    // Take rest from sorted
    combinations.sort((a, b) => ((a.data as number) - (b.data as number)) * Math.sign(connection.degreeAssortativity));
    finalEdges.push(...combinations.slice(0, assortative));

    return finalEdges.slice(0, connection.edgeCount);
  }

  private computeFastMeasures() {
    const compute = (graph: EdgeList): GraphMeasures => {
      const measures = EmptyMeasures();
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
    this.configuration.value.instance.clusterMeasures.clear();
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

  private async initWebGPU() {
    if (!navigator.gpu) {
      alert("NetworkBuilder requires WebGPU. You may be using an incompatible Browser.");
      return;
    }
    const adapter = (await navigator.gpu.requestAdapter({ powerPreference: "high-performance" }))!;
    if (!adapter) {
      alert("NetworkBuilder requires WebGPU. You may be using an incompatible Browser.");
      return;
    }
    const device = await adapter.requestDevice({
      requiredLimits: {
          "maxStorageBufferBindingSize": adapter.limits.maxStorageBufferBindingSize,
          "maxComputeWorkgroupsPerDimension": adapter.limits.maxComputeWorkgroupsPerDimension
      }
    });
    this.layout = new ForceDirected(device);
    console.log("Layout intialized.");
  }

  private async runLayout(graph: EdgeList, layout: ForceDirected | undefined, signal: AbortSignal) {
    if (layout == undefined) {
      console.log("WebGPU initialization failed.");
      return;
    }

    const layoutSettings = this.layoutSettings.value;
    Utility.rand = new Rand(this.configuration.value.definition.seed.toString());
    if (layoutSettings.sampling < 1) {
      graph = Utility.sampleRandomEdges(graph, layoutSettings.sampling * graph.edges.length);
    }
    this.sample.next(graph);

    if (graph.nodes.length == 0) {
      this.forceDirectedLayout.next(graph);
      return;
    }

    const nodeData: Array<number> = [];
    const edgeData: Array<number> = [];
    const sourceEdges: Array<number> = [];
    const targetEdges: Array<number> = [];

    for (let i = 0; i < graph.nodes.length; i++) {
      const node = graph.nodes[i];
      const data = node.data as NodeData;
      data.samplingID = i;
      if (data.layoutPosition.x == 0 && data.layoutPosition.y == 0) {
        data.layoutPosition = {
          x: Utility.rand.next() - 0.5,
          y: Utility.rand.next() - 0.5
        }
      }
      nodeData.push(0.0, data.layoutPosition.x, data.layoutPosition.y, 1.0);
    }
    for (let i = 0; i < graph.edges.length; i++) {
      const source = graph.edges[i].source.data as NodeData;
      const target = graph.edges[i].target.data as NodeData;
      edgeData.push(source.samplingID, target.samplingID);
    }

    graph.edges.sort((a, b) => (a.source.data as NodeData).samplingID - (b.source.data as NodeData).samplingID);
    for (let i = 0; i < graph.edges.length; i++) {
      const source = graph.edges[i].source.data as NodeData;
      const target = graph.edges[i].target.data as NodeData;
      sourceEdges.push(source.samplingID, target.samplingID);
    }
    graph.edges.sort((a, b) => (a.target.data as NodeData).samplingID - (b.target.data as NodeData).samplingID);
    for (let i = 0; i < graph.edges.length; i++) {
      const source = graph.edges[i].source.data as NodeData;
      const target = graph.edges[i].target.data as NodeData;
      targetEdges.push(source.samplingID, target.samplingID);
    }

    const nodeDataBuffer = layout.device.createBuffer({
      size: nodeData.length * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true,
    });
    new Float32Array(nodeDataBuffer.getMappedRange()).set(nodeData);
    nodeDataBuffer.unmap();
    const edgeDataBuffer = layout.device.createBuffer({
      size: edgeData.length * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
      mappedAtCreation: true
    });
    new Uint32Array(edgeDataBuffer.getMappedRange()).set(edgeData);
    edgeDataBuffer.unmap();

    const edgeLength = edgeData.length;
    const nodeLength = nodeData.length / 4;

    const sourceEdgeDataBuffer = layout.device.createBuffer({
      size: edgeData.length * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
      mappedAtCreation: true
    });
    new Uint32Array(sourceEdgeDataBuffer.getMappedRange()).set(sourceEdges);
    sourceEdgeDataBuffer.unmap();
    const targetEdgeDataBuffer = layout.device.createBuffer({
      size: edgeData.length * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
      mappedAtCreation: true
    });
    new Uint32Array(targetEdgeDataBuffer.getMappedRange()).set(targetEdges);
    targetEdgeDataBuffer.unmap();

    this.centroids.value.clear();
    const frame = (positions: number[], timestamp: number) => {
      // Assemble node data
      for (let i = 0; i < 4 * nodeLength; i = i + 4) {
        (graph.nodes[i / 4].data as NodeData).layoutPosition = {
            x: positions[i + 1],
            y: positions[i + 2]
        };
      }

      // Update centroids
      for (const [id, cluster] of this.configuration.value.instance.clusters) {
        let c: Point = { x: 0, y: 0 };
        let i = 0;
        for (const node of cluster.nodes) {
          const data = node.data as NodeData;
          if (data.samplingID != -1) {
            c.x += data.layoutPosition.x;
            c.y += data.layoutPosition.y;
            i++;
          }
        }
        if (i > 0) {
          c.x /= i;
          c.y /= i;
        }
        this.centroids.value.set(id, c);
      }
      this.centroids.next(this.centroids.value);

      // Output new frame
      this.forceDirectedLayout.next(graph);
    };

    await layout.runForces(
      nodeDataBuffer, edgeDataBuffer,
      nodeLength, edgeLength,
      0.5, 0.05 + Math.log(1 + layoutSettings.gravity / 100), layoutSettings.iterations, layoutSettings.gravity,
      sourceEdgeDataBuffer, targetEdgeDataBuffer, frame, signal
    );


    // Overlap prevention step
    const minDist = 0.6;
    const strength = 0.02;
    const levels = Utility.getNodeDepths(this.configuration.value.definition.graph);
    // Only avoid overlap for nodes that can appear together
    const levelMap = new Map<number, number>();
    for (const [node, level] of levels) {
      const cluster = node.data as Cluster;
      levelMap.set(node.id, cluster.children.length > 0 ? level : -level);
    }

    const antiOverlap = (iterations: number) => {
      if (signal.aborted) {
        return;
      }

      const centroids = [...this.centroids.value];
      const forces: Point[] = Array(centroids.length);

      let change = false;
      for (let i = 0; i < centroids.length; i++) {;
        const level1 = levelMap.get(centroids[i][0])!;
        // Repell
        let force: Point = { x: 0, y: 0 };
        for (let j = 0; j < centroids.length; j++) {
          const level2 = levelMap.get(centroids[j][0])!;
          if (i == j || level1 != level2 && level1 > 0 && level2 > 0) {
            continue;
          }
          const dir = Utility.subtractP(centroids[i][1], centroids[j][1]);
          const dist = Utility.magintudeP(dir);
          if (dist < minDist) {
            const f = Utility.scalarMultiplyP(strength, Utility.normalizeP(dir));
            force = Utility.addP(force, f);
            change = true;
          }
        }
        forces[i] = force;
      }
      // Apply forces
      for (let i = 0; i < this.centroids.value.size; i++) {
        this.centroids.value.set(centroids[i][0], Utility.addP(centroids[i][1], forces[i]));
      }
      this.centroids.next(this.centroids.value);
      if (iterations > 0 && change) {
        requestAnimationFrame(() => antiOverlap(iterations - 1));
      }
    };

    // 100 iterations sufficient to reach min distance in most cases
    antiOverlap(100);

    // Layout finished
  }
}
