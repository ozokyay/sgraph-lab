import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, Input, OnChanges, SimpleChanges, EventEmitter, Output } from '@angular/core';
import { ConfigurationService } from '../configuration.service';
import { ForceDirected } from '../graphwagu/webgpu/force_directed';
import { EdgeData, EdgeList, Node, NodeData } from '../graph';
import * as PIXI from 'pixi.js';
import * as d3 from 'd3';
import { Utility } from '../utility';
import Rand from 'rand-seed';
import { Cluster } from '../cluster';
import { Point } from '../point';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-vis-node-link',
  standalone: true,
  imports: [],
  templateUrl: './vis-node-link.component.html',
  styleUrl: './vis-node-link.component.css'
})
export class VisNodeLinkComponent implements AfterViewInit, OnChanges, OnDestroy {

  private edgeScale = 500;
  private nodeRadius = 3;
  private nodeRadiusRange = [1, 6];

  private app!: PIXI.Application;
  private stage!: PIXI.Container;
  private rect!: DOMRect;
  private width: number = 0;
  private height: number = 0;
  private nodeDict: Map<Node, PIXI.Graphics> = new Map();
  private edgeGraphics!: PIXI.Graphics;
  private abort: AbortController = new AbortController();
  private centroidLerp: number = 1;
  private centroidLerpTargetTime: number = 0;
  private centroidLerpTransitionTime: number = 500;
  private lastRenderTime: number = 0;

  private subscriptions: Subscription[] = [];

  @Input()
  public combineClusters = true;

  @Input()
  public transform = { value: new d3.ZoomTransform(1, 0, 0) };

  @ViewChild('container')
  private container!: ElementRef;
  @ViewChild('tooltip')
  private tooltip!: ElementRef;

  constructor(private config: ConfigurationService) {}

  private init() {
    this.subscriptions.push(this.config.sample.subscribe(graph => {
      this.abort.abort();
      this.abort = new AbortController();
      this.createNodes(graph);
    }));
    this.subscriptions.push(this.config.forceDirectedLayout.subscribe(graph => {
      this.render(graph, this.abort.signal);
    }));
    this.subscriptions.push(this.config.selectedConnections.subscribe(() => {
      if (this.config.forceDirectedLayout.value.nodes.length > 0) {
        this.createNodes(this.config.forceDirectedLayout.value);
        this.render(this.config.forceDirectedLayout.value, this.abort.signal);
      }
    }));
    this.subscriptions.push(this.config.graphicsSettings.subscribe(s => {
      if (this.config.forceDirectedLayout.value.nodes.length > 0) {
        this.createNodes(this.config.forceDirectedLayout.value);
        this.render(this.config.forceDirectedLayout.value, this.abort.signal);
      }
    }));
    this.subscriptions.push(this.config.selectedDiffusionSeeds.subscribe(() => {
      if (this.config.forceDirectedLayout.value.nodes.length > 0) {
        this.createNodes(this.config.forceDirectedLayout.value);
        this.render(this.config.forceDirectedLayout.value, this.abort.signal);
      }
    }));
  }

  private createNodes(graph: EdgeList) {
    for (const gfx of this.nodeDict.values()) {
      this.stage.removeChild(gfx);
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

  private render(graph: EdgeList, signal: AbortSignal, timestamp?: number) {
    if (graph == undefined) {
      console.log("No graph");
      return;
    }

    if (signal.aborted) {
      return;
    }

    if (timestamp != undefined) {
      if (timestamp == this.lastRenderTime) {
        return;
      } else {
        this.lastRenderTime = timestamp;
      }
    }

    this.zoom(this.transform.value);

    // let zooming = d3.select(this.app.canvas as any)
    //   .call(this.zoom.on('zoom', zoom).filter((e: any) => (!e.ctrlKey || e.type === 'wheel') && !e.button && !e.shiftKey));
    
    // Initial zoom to center
    // if (this.transform.x == 0 && this.transform.y == 0) {
    //   zooming.call(this.zoom.transform, d3.zoomIdentity.translate(this.width / 2, this.height / 2));
    // }

    // Apply graphics settings
    const settings = this.config.graphicsSettings.value;


    // Join with selectedConnections to determine alpha/highlight value
    const anySelection = this.config.selectedConnections.value.length > 0;
    const selectedEdges = [...this.config.configuration.value.instance.connections.entries()]
                            .filter(([k, v]) => this.config.selectedConnections.value.indexOf(k) != -1)
                            .flatMap(([k, v]) => v);


    // Set node positions
    // Lerp for possible cluster aggregation
    for (const node of graph.nodes) {
      const data = node.data as NodeData;
      const centroid = this.config.centroids.value.get(data.clusterID);
      const gfx = this.nodeDict.get(node);
      if (data == undefined || centroid == undefined || gfx == undefined) {
        return;
      }
      data.renderPosition = Utility.lerpP(data.layoutPosition, centroid, this.centroidLerp);
      gfx.position = {
        x: data.renderPosition.x * this.edgeScale,
        y: data.renderPosition.y * this.edgeScale
      };

      

      // Change fill/tint depending on selection
      // Or re-create nodes in subject change subscription event

      // Kind of prefer tint here tbh (less calls other than render)
      // Or just call createNodes(), easy
    }

    // Render edges
    this.edgeGraphics.clear();
    for (const edge of graph.edges) {
      const data = edge.data as EdgeData;
      const source = edge.source.data as NodeData;
      const target = edge.target.data as NodeData;

      // Transparency of unselected if there is an active selection
      const alpha = !anySelection || selectedEdges.indexOf(edge) != -1 ? 1 : 0.2;

      const middle = {
        x: (source.renderPosition.x + target.renderPosition.x) / 2,
        y: (source.renderPosition.y + target.renderPosition.y) / 2
      };
      this.edgeGraphics.moveTo(source.renderPosition.x * this.edgeScale, source.renderPosition.y * this.edgeScale);
      this.edgeGraphics.lineTo(middle.x * this.edgeScale, middle.y * this.edgeScale);
      this.edgeGraphics.stroke({width: 1, color: this.getNodeColor(edge.source, settings.edgeColoring), alpha: alpha });
      this.edgeGraphics.moveTo(middle.x * this.edgeScale, middle.y * this.edgeScale);
      this.edgeGraphics.lineTo(target.renderPosition.x * this.edgeScale, target.renderPosition.y * this.edgeScale);
      this.edgeGraphics.stroke({width: 1, color: this.getNodeColor(edge.target, settings.edgeColoring), alpha: alpha });
    }

    // Render convex hull

    // Problem: Outliers -> soft margin -> pre-filter points too far away from centroid -> hyper-parameter?

    // const cluster1 = [...this.config.configuration.value.instance.clusters.values()][0].nodes;
    // const points: [number, number][] = cluster1.map(n => {
    //   const data = n.data as NodeData;
    //   return [data.renderPosition.x, data.renderPosition.y];
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

  private centroidInterpolation(graph: EdgeList, timestamp: number) {
    if (this.centroidLerpTargetTime == 0) {
      // Current time ms + remaining (depending on direction) * transition ms
      this.centroidLerpTargetTime = timestamp + (this.combineClusters ? this.centroidLerp : 1 - this.centroidLerp) * this.centroidLerpTransitionTime;
    }
    const elapsed = Math.min(this.centroidLerpTransitionTime, timestamp - this.centroidLerpTargetTime); // milliseconds
    if (this.combineClusters) {
      this.centroidLerp = elapsed / this.centroidLerpTransitionTime;
    } else {
      this.centroidLerp = 1 - elapsed / this.centroidLerpTransitionTime;
    }
    if (this.stage != undefined) {
      this.render(graph, this.abort.signal, timestamp); 
    }
    if (elapsed < this.centroidLerpTransitionTime) {
      requestAnimationFrame(t => this.centroidInterpolation(graph, t));
    }
  }

  public ngOnDestroy() {
    this.app.destroy();
    this.abort.abort();
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    this.subscriptions = [];
  }

  public ngAfterViewInit() {
    this.app = new PIXI.Application();
    (async () => {
      await this.app.init({
        preference: 'webgl',
        background: 'white',
        antialias: true
      });
      this.container.nativeElement.appendChild(this.app.canvas);
      this.stage = new PIXI.Container({
        isRenderGroup: true
      });
      this.app.stage.addChild(this.stage);
      this.edgeGraphics = new PIXI.Graphics();
      this.stage.addChild(this.edgeGraphics);
      this.resize();
      this.init();
    })();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes["combineClusters"] &&
      changes["combineClusters"].previousValue != this.combineClusters) {
        if (this.config.forceDirectedLayout.value.nodes.length > 0) {
          this.centroidLerpTargetTime = 0;
          requestAnimationFrame(t => this.centroidInterpolation(this.config.forceDirectedLayout.value, t));
        } else {
          this.centroidLerp = this.combineClusters ? 1 : 0;
        }
    }
    if (changes["transform"]) {
      if (this.stage != undefined) {
        this.zoom(this.transform.value);
      }
    }
  }

  public resize(): void {
    this.width = this.container.nativeElement.clientWidth;
    this.height = this.container.nativeElement.clientHeight;
    this.app.renderer.resize(this.width * window.devicePixelRatio, this.height * window.devicePixelRatio);
    this.app.canvas.style!.width = `${this.width}px`;
    this.app.canvas.style!.height = `${this.height}px`;
    this.rect = (this.app.canvas as any).getBoundingClientRect();
  }

  public zoom(transform: d3.ZoomTransform) {
    this.stage.scale = { x: transform.k, y: transform.k };
    this.stage.pivot = { x: -transform.x / transform.k * devicePixelRatio, y: -transform.y / transform.k * devicePixelRatio };
  }
}
