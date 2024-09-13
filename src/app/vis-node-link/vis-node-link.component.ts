import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, HostListener } from '@angular/core';
import { ConfigurationService } from '../configuration.service';
import { ForceDirected } from '../graphwagu/webgpu/force_directed';
import { EdgeData, EdgeList, Node, NodeData } from '../graph';
import * as PIXI from 'pixi.js';
import * as d3 from 'd3';
import { Utility } from '../utility';
import Rand from 'rand-seed';
import { Cluster } from '../cluster';

@Component({
  selector: 'app-vis-node-link',
  standalone: true,
  imports: [],
  templateUrl: './vis-node-link.component.html',
  styleUrl: './vis-node-link.component.css'
})
export class VisNodeLinkComponent {

  private edgeScale = 500;
  private nodeRadius = 3;
  private nodeRadiusRange = [1, 6];

  private app!: PIXI.Application;
  private stage!: PIXI.Container;
  private rect!: DOMRect;
  private width: number = 0;
  private height: number = 0;
  private transform = new d3.ZoomTransform(1, 0, 0);
  private zoom = d3.zoom();
  private nodeDict: Map<Node, PIXI.Graphics> = new Map();
  private edgeGraphics?: PIXI.Graphics = undefined;
  private graph?: EdgeList = undefined;
  private abort: AbortController = new AbortController();

  @ViewChild('container')
  private container!: ElementRef;
  @ViewChild('tooltip')
  private tooltip!: ElementRef;

  private device?: GPUDevice = undefined;
  private layout?: ForceDirected = undefined;

  constructor(private config: ConfigurationService) {
    this.initWebGPU();
    config.configuration.subscribe(async config => {
      if (this.layout == undefined) {
        if (config.instance.graph.nodes.length > 0) {
          console.log("Layout initialization failed.");
        }
        return;
      }

      this.abort.abort();
      this.abort = new AbortController();
      this.graph = this.prepare(config.instance.graph);
      await this.runLayout(this.graph, this.abort.signal);
    });
    config.selectedConnections.subscribe(async () => {
      if (config.configuration.value.instance.graph.nodes.length > 0 && this.graph != undefined) {
        this.createNodes(this.graph);
        this.render(this.graph);
      }
    });
    config.layoutSettings.subscribe(async () => {
      if (config.configuration.value.instance.graph.nodes.length > 0) {
        this.abort.abort();
        this.abort = new AbortController();
        this.graph = this.prepare(config.configuration.value.instance.graph);
        await this.runLayout(config.configuration.value.instance.graph, this.abort.signal);
      }
    });
    config.graphicsSettings.subscribe(() => {
      if (config.configuration.value.instance.graph.nodes.length > 0 && this.graph != undefined) {
        this.createNodes(this.graph);
        this.render(this.graph);
      }
    });
    config.selectedDiffusionSeeds.subscribe(() => {
      if (this.graph != undefined && this.graph.nodes.length > 0) {
        this.createNodes(this.graph);
        this.render(this.graph);
      }
    });
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
    this.device = await adapter.requestDevice({
      requiredLimits: {
          "maxStorageBufferBindingSize": adapter.limits.maxStorageBufferBindingSize,
          "maxComputeWorkgroupsPerDimension": adapter.limits.maxComputeWorkgroupsPerDimension
      }
    });
    this.layout = new ForceDirected(this.device);
    console.log("Layout intialized.");
  }

  private prepare(graph: EdgeList): EdgeList {
    // Prepare stage
    this.stage?.destroy(true);
    this.stage = new PIXI.Container({
      isRenderGroup: true
    });
    this.app.stage.addChild(this.stage);

    // Prepare graph
    const settings = this.config.layoutSettings.value;
    Utility.rand = new Rand(this.config.configuration.value.definition.seed.toString());
    if (settings.sampling < 1) {
      graph = Utility.sampleRandomEdges(graph, settings.sampling * graph.edges.length);
    }

    // Prepare nodes
    this.createNodes(graph);

    return graph;
  }

  private createNodes(graph: EdgeList) {
    for (const gfx of this.nodeDict.values()) {
      gfx.destroy();
    }
    this.nodeDict.clear();

    const degrees = this.config.measures.value.globalMeasures.degrees;
    const degreesExtent = d3.extent(degrees.values()) as [number, number];
    const radiusScale = d3.scaleLinear().domain(degreesExtent).range(this.nodeRadiusRange);

    const selectedEdges = [...this.config.configuration.value.instance.connections.entries()]
                              .filter(([k, v]) => this.config.selectedConnections.value.indexOf(k) != -1)
                              .flatMap(([k, v]) => v);

    for (const node of graph.nodes) {
      const gfx = new PIXI.Graphics({ zIndex: 1 });
      let radius = this.nodeRadius;
      if (this.config.graphicsSettings.value.nodeRadius) {
        radius = radiusScale(degrees.get(node)!);
      }
      gfx.circle(0, 0, radius);

      // Alpha: This node has selected incident edges
      // This does not only depend on cluster id, but must be from the correct edge bundle which makes things inefficient
      const anySelection = this.config.selectedConnections.value.length > 0;
      const alpha = !anySelection || selectedEdges.find(e => e.source == node || e.target == node) ? 1 : 0.2;

      gfx.stroke({ width: 3, color: 'black', alpha: alpha });
      gfx.fill({ color: this.getNodeColor(node, this.config.graphicsSettings.value.nodeColoring), alpha: alpha });
      gfx.interactive = true;
      gfx.onmouseenter = () => {
        gfx.tint = 0x9A9A9A;
      };
      gfx.onmouseleave = () => {
        gfx.tint = 0xFFFFFF;
      }
      gfx.onclick = () => {
        const seeds = this.config.selectedDiffusionSeeds.value;
        if (seeds.has(node)) {
          seeds.delete(node);
        } else {
          seeds.add(node);
        }
        this.config.selectedDiffusionSeeds.next(seeds);
      };
      this.nodeDict.set(node, gfx);
      this.stage.addChild(gfx);
    }
  }

  private async runLayout(graph: EdgeList, signal: AbortSignal) {
    if (this.device == undefined || this.layout == undefined) {
      console.log("WebGPU initialization failed.");
      return;
    }

    if (graph.nodes.length == 0) {
      this.render(graph);
      return;
    }

    const nodeData: Array<number> = [];
    const edgeData: Array<number> = [];
    const sourceEdges: Array<number> = [];
    const targetEdges: Array<number> = [];

    for (let i = 0; i < graph.nodes.length; i++) {
      const node = graph.nodes[i];
      const data = node.data as NodeData;
      if (data.layoutPosition.x == 0 && data.layoutPosition.y == 0) {
        data.layoutPosition = {
          x: Utility.rand.next() - 0.5,
          y: Utility.rand.next() - 0.5
        }
      }
      nodeData.push(0.0, data.layoutPosition.x, data.layoutPosition.y, 1.0);
    }
    for (let i = 0; i < graph.edges.length; i++) {
      const source = graph.edges[i].source;
      const target = graph.edges[i].target;
      edgeData.push(source.id, target.id);
    }

    graph.edges.sort(function (a, b) { return (a.source.id > b.source.id) ? 1 : ((b.source.id > a.source.id) ? -1 : 0); });
    for (let i = 0; i < graph.edges.length; i++) {
      const source = graph.edges[i].source;
      const target = graph.edges[i].target;
      sourceEdges.push(source.id, target.id);
    }
    graph.edges.sort(function (a, b) { return (a.target.id > b.target.id) ? 1 : ((b.target.id > a.target.id) ? -1 : 0); });
    for (let i = 0; i < graph.edges.length; i++) {
      const source = graph.edges[i].source;
      const target = graph.edges[i].target;
      targetEdges.push(source.id, target.id);
    }

    const nodeDataBuffer = this.device.createBuffer({
      size: nodeData.length * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true,
    });
    new Float32Array(nodeDataBuffer.getMappedRange()).set(nodeData);
    nodeDataBuffer.unmap();
    const edgeDataBuffer = this.device.createBuffer({
      size: edgeData.length * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
      mappedAtCreation: true
    });
    new Uint32Array(edgeDataBuffer.getMappedRange()).set(edgeData);
    edgeDataBuffer.unmap();

    const edgeLength = edgeData.length;
    const nodeLength = nodeData.length / 4;

    const sourceEdgeDataBuffer = this.device.createBuffer({
      size: edgeData.length * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
      mappedAtCreation: true
    });
    new Uint32Array(sourceEdgeDataBuffer.getMappedRange()).set(sourceEdges);
    sourceEdgeDataBuffer.unmap();
    const targetEdgeDataBuffer = this.device.createBuffer({
      size: edgeData.length * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
      mappedAtCreation: true
    });
    new Uint32Array(targetEdgeDataBuffer.getMappedRange()).set(targetEdges);
    targetEdgeDataBuffer.unmap();

    const frame = (positions: number[]) => {
      // Assemble node data
      for (let i = 0; i < 4 * nodeLength; i = i + 4) {
        (graph.nodes[i / 4].data as NodeData).layoutPosition = {
            x: positions[i + 1],
            y: positions[i + 2]
        };
      }

      this.render(graph);
    };

    const settings = this.config.layoutSettings.value;
    await this.layout.runForces(
      nodeDataBuffer, edgeDataBuffer,
      nodeLength, edgeLength,
      0.5, 0.05 + Math.log(1 + settings.gravity / 100), settings.iterations, settings.gravity,
      sourceEdgeDataBuffer, targetEdgeDataBuffer, frame, signal
    );

    // Layout finished
  }

  private render(graph: EdgeList) {
    if (this.graph == undefined) {
      console.log("No graph");
      return;
    }

    // Zoom and pan
    const zoom = (e: any) => {
      this.transform = e.transform;
      this.stage.scale = { x: e.transform.k, y: e.transform.k };
      this.stage.pivot = { x: -e.transform.x / e.transform.k * devicePixelRatio, y: -e.transform.y / e.transform.k * devicePixelRatio };
    }
    zoom({ transform: this.transform });

    let zooming = d3.select(this.app.canvas as any)
      .call(this.zoom.on('zoom', zoom));
    
    // Initial zoom
    if (this.transform.x == 0 && this.transform.y == 0) {
      zooming.call(this.zoom.transform, d3.zoomIdentity.translate(this.width / 2, this.height / 2))
    }

    // Apply graphics settings
    const settings = this.config.graphicsSettings.value;


    // Join with selectedConnections to determine alpha/highlight value
    const anySelection = this.config.selectedConnections.value.length > 0;
    const selectedEdges = [...this.config.configuration.value.instance.connections.entries()]
                            .filter(([k, v]) => this.config.selectedConnections.value.indexOf(k) != -1)
                            .flatMap(([k, v]) => v);

    // Render edges
    this.edgeGraphics?.destroy();
    this.edgeGraphics = new PIXI.Graphics();
    this.stage.addChild(this.edgeGraphics);
    for (const edge of this.graph.edges) {
      const data = edge.data as EdgeData;
      const source = edge.source.data as NodeData;
      const target = edge.target.data as NodeData;

      // Transparency of unselected if there is an active selection
      const alpha = !anySelection || selectedEdges.indexOf(edge) != -1 ? 1 : 0.2;

      const middle = {
        x: (source.layoutPosition.x + target.layoutPosition.x) / 2,
        y: (source.layoutPosition.y + target.layoutPosition.y) / 2
      };
      this.edgeGraphics.moveTo(source.layoutPosition.x * this.edgeScale, source.layoutPosition.y * this.edgeScale);
      this.edgeGraphics.lineTo(middle.x * this.edgeScale, middle.y * this.edgeScale);
      this.edgeGraphics.stroke({width: 1, color: this.getNodeColor(edge.source, settings.edgeColoring), alpha: alpha });
      this.edgeGraphics.moveTo(middle.x * this.edgeScale, middle.y * this.edgeScale);
      this.edgeGraphics.lineTo(target.layoutPosition.x * this.edgeScale, target.layoutPosition.y * this.edgeScale);
      this.edgeGraphics.stroke({width: 1, color: this.getNodeColor(edge.target, settings.edgeColoring), alpha: alpha });
    }
    
    // Set node positions
    for (const node of this.graph.nodes) {
      const data = node.data as NodeData;
      let gfx = this.nodeDict.get(node)!;
      gfx.position = {
        x: data.layoutPosition.x * this.edgeScale,
        y: data.layoutPosition.y * this.edgeScale
      };

      // Change fill/tint depending on selection
      // Or re-create nodes in subject change subscription event

      // Kind of prefer tint here tbh (less calls other than render)
      // Or just call createNodes(), easy
    }

    // Render convex hull

    // Problem: Outliers -> soft margin -> pre-filter points too far away from centroid -> hyper-parameter?

    // const cluster1 = [...this.config.configuration.value.instance.clusters.values()][0].nodes;
    // const points: [number, number][] = cluster1.map(n => {
    //   const data = n.data as NodeData;
    //   return [data.layoutPosition.x, data.layoutPosition.y];
    // });
    // const hull = d3.polygonHull(points)!;
    // for (let i = 0; i < hull.length; i++) {
    //   const point1 = hull[i];
    //   const point2 = hull[i == hull.length - 1 ? 0 : (i + 1)];
    //   this.edgeGraphics.moveTo(point1[0] * this.edgeScale, point1[1] * this.edgeScale);
    //   this.edgeGraphics.lineTo(point2[0] * this.edgeScale, point2[1] * this.edgeScale);
    // }
    // this.edgeGraphics.stroke({width: 4, color: 'gray'});
  }

  private getNodeColor(node: Node, communityColor: boolean = true): number | string {
    if (this.config.selectedDiffusionSeeds.value.has(node)) {
      return 0xFF00FF;
    } else if (communityColor) {
      const data = node.data as NodeData;
      const clusterNode = this.config.configuration.value.definition.graph.nodeDictionary.get(data.clusterID)!;
      const cluster = clusterNode.data as Cluster;
      return cluster.color;
    } else {
      return 0x000000
    }
  }

  private ngOnDestroy() {
    this.app.destroy();
  }

  private ngAfterViewInit() {
    this.app = new PIXI.Application();
    (async () => {
      await this.app.init({
        preference: 'webgpu',
        background: 'white',
        antialias: true
      });
      this.container.nativeElement.appendChild(this.app.canvas);
      this.resize();
    })();
  }

  @HostListener('window:resize')
  public resize(): void {
    this.width = this.container.nativeElement.offsetWidth;
    this.height = this.container.nativeElement.offsetHeight;
    this.app.renderer.resize(this.width * window.devicePixelRatio, this.height * window.devicePixelRatio);
    this.app.canvas.style!.width = `${this.width}px`;
    this.app.canvas.style!.height = `${this.height}px`;
    this.rect = (this.app.canvas as any).getBoundingClientRect();
  }
}
