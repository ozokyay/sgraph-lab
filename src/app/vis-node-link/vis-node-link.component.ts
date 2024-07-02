import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, HostListener } from '@angular/core';
import { ConfigurationService } from '../configuration.service';
import { ForceDirected } from '../graphwagu/webgpu/force_directed';
import { EdgeData, EdgeList, Node, NodeData } from '../graph';
import * as PIXI from 'pixi.js';
import * as d3 from 'd3';

@Component({
  selector: 'app-vis-node-link',
  standalone: true,
  imports: [],
  templateUrl: './vis-node-link.component.html',
  styleUrl: './vis-node-link.component.css'
})
export class VisNodeLinkComponent {

  private app!: PIXI.Application;
  private stage!: PIXI.Container;
  private rect!: DOMRect;
  private width: number = 0;
  private height: number = 0;
  private transform = new d3.ZoomTransform(1, 0, 0);
  private zoom = d3.zoom();

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

      await this.runLayout(config.instance.graph);
      this.render();
    });
  }

  private async runLayout(graph: EdgeList) {
    if (this.device == undefined || this.layout == undefined) {
      console.log("WebGPU initialization failed.");
      return;
    }

    const nodeData: Array<number> = [];
    const edgeData: Array<number> = [];
    const sourceEdges: Array<number> = [];
    const targetEdges: Array<number> = [];

    const nodesToIndex = new Map<Node, number>();

    for (let i = 0; i < graph.nodes.length; i++) {
      nodeData.push(0.0, Math.random(), Math.random(), 1.0);
      nodesToIndex.set(graph.nodes[i], i);
    }
    for (let i = 0; i < graph.edges.length; i++) {
      const source = graph.edges[i].source;
      const target = graph.edges[i].target;
      const s = nodesToIndex.get(source)!;
      const t = nodesToIndex.get(target)!;
      edgeData.push(s, t);
    }

    graph.edges.sort(function (a, b) { return (a.source.id > b.source.id) ? 1 : ((b.source.id > a.source.id) ? -1 : 0); });
    for (let i = 0; i < graph.edges.length; i++) {
      const source = graph.edges[i].source;
      const target = graph.edges[i].target;
      const s = nodesToIndex.get(source)!;
      const t = nodesToIndex.get(target)!;
      sourceEdges.push(s, t);
    }
    graph.edges.sort(function (a, b) { return (a.target.id > b.target.id) ? 1 : ((b.target.id > a.target.id) ? -1 : 0); });
    for (let i = 0; i < graph.edges.length; i++) {
      const source = graph.edges[i].source;
      const target = graph.edges[i].target;
      const s = nodesToIndex.get(source)!;
      const t = nodesToIndex.get(target)!;
      targetEdges.push(s, t);
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

    const frame = () => {
      // Should update positions first
      // this.render();
    };

    const positions = await this.layout.runForces(
      nodeDataBuffer, edgeDataBuffer,
      nodeLength, edgeLength,
      0.9, 0.05, 1000, 100,
      sourceEdgeDataBuffer, targetEdgeDataBuffer, frame
    );

    if (positions == undefined) {
      console.log("Layout computation failed.");
      return;
    }

    // Assemble node data
    for (let i = 0; i < 4 * nodeLength; i = i + 4) {
      (graph.nodes[i / 4].data as NodeData).layoutPosition = {
          x: positions[i + 1],
          y: positions[i + 2]
      };
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
    this.device = await adapter.requestDevice({
      requiredLimits: {
          "maxStorageBufferBindingSize": adapter.limits.maxStorageBufferBindingSize,
          "maxComputeWorkgroupsPerDimension": adapter.limits.maxComputeWorkgroupsPerDimension
      }
    });
    this.layout = new ForceDirected(this.device);
    console.log("Layout intialized.");
  }

  private render() {
    this.stage?.destroy(true);
    this.stage = new PIXI.Container({
      isRenderGroup: true
    });
    this.app.stage.addChild(this.stage);

    const zoom = (e: any) => {
      this.transform = e.transform;
      this.stage.scale = { x: e.transform.k, y: e.transform.k };
      this.stage.pivot = { x: -e.transform.x / e.transform.k * devicePixelRatio, y: -e.transform.y / e.transform.k * devicePixelRatio };
    }
    zoom({ transform: this.transform });

    let zooming = d3.select(this.app.canvas as any)
      // .call(d3.drag()
      //   .container(this.app.canvas as any)
      //   .subject(d => this.simulation?.find(calculateTransformedX(d.x), calculateTransformedY(d.y), 10))
      //   .on('start', dragstarted)
      //   .on('drag', dragged)
      //   .on('end', dragended)
      // )
      .call(this.zoom
        .on('zoom', zoom)
      );
    
    // Initial zoom
    if (this.transform.x == 0 && this.transform.y == 0) {
      zooming.call(this.zoom.transform, d3.zoomIdentity.translate(this.width / 2, this.height / 2))
    }


    // Render graph
    const graphics = new PIXI.Graphics();
    this.stage.addChild(graphics);

    for (const edge of this.config.configuration.value.instance.graph.edges) {
      const data = edge.data as EdgeData;
      const source = edge.source.data as NodeData;
      const target = edge.target.data as NodeData;
      graphics.moveTo(source.layoutPosition.x * 1000, source.layoutPosition.y * 1000);
      graphics.lineTo(target.layoutPosition.x * 1000, target.layoutPosition.y * 1000);
    }

    graphics.stroke({width: 4, color: 'black'});

    for (const node of this.config.configuration.value.instance.graph.nodes) {
      const data = node.data as NodeData;
      const gfx = new PIXI.Graphics();
      gfx.circle(data.layoutPosition.x * 1000, data.layoutPosition.y * 1000, 10);
      gfx.stroke({width: 1, color: 'black'});
      gfx.fill({color: 'gray'});
      this.stage.addChild(gfx);
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
