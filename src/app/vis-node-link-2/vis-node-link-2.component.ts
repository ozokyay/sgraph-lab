import { Component, ElementRef, ViewChild, HostListener, AfterViewInit, OnDestroy, Input } from '@angular/core';
import { ConfigurationService } from '../configuration.service';
import { Edge, EdgeData, EdgeList, Node, NodeData } from '../graph';
import * as PIXI from 'pixi.js';
import * as d3 from 'd3';
import { Utility } from '../utility';
import Rand from 'rand-seed';
import { Cluster } from '../cluster';
import { Point } from '../point';
import { ClusterConnection } from '../cluster-connection';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-vis-node-link-2',
  standalone: true,
  imports: [],
  templateUrl: './vis-node-link-2.component.html',
  styleUrl: './vis-node-link-2.component.css'
})
export class VisNodeLink2Component implements AfterViewInit, OnDestroy {

  private edgeScale = 500;
  private nodeRadius = 3;
  private nodeRadiusRange = [50, 150];
  private edgeWidthRange = [5, 25]

  private app!: PIXI.Application;
  private stage!: PIXI.Container;
  private rect!: DOMRect;
  private width: number = 0;
  private height: number = 0;
  private transform = new d3.ZoomTransform(1, 0, 0);
  private zoom = d3.zoom();
  private nodeDict: Map<Node, PIXI.Graphics> = new Map();
  private edgeGraphics!: PIXI.Graphics;
  private graph?: EdgeList = undefined;
  private abort: AbortController = new AbortController();
  private edgeWidthScale!: d3.ScaleLinear<number, number, never>;
  private circleSpacingNode?: Node = undefined;
  private circleSpacingLerp: number = 0;
  private circleSpacingLerpStart: number = 0;
  private lastRenderTime: number = 0;

  @Input()
  public mode: "aggregate" | "minimap" = "aggregate";

  @ViewChild('container')
  private container!: ElementRef;
  @ViewChild('canvas')
  private canvas!: ElementRef;
  @ViewChild('tooltip')
  private tooltip!: ElementRef;

  private subscriptions: Subscription[] = [];

  constructor(private config: ConfigurationService) { }

  private init() {
    this.subscriptions.push(this.config.configuration.subscribe(config => {
      // Even anything to do here? Only act on centroids?
      // => Minimap needs centroids
      // => Simple higher levels need centroids
      // => Tree doesn't need centroids, but can wait for them
      // => Circle packing doesn't need centroids, but also requires full nodes option
      // => A) implement circle packing twice, layout per cluster?
      // => B) circle packing only here

      // How to sync with cluster list (conflicting vis can be open -> highlight only one last clicked in vis)

      this.graph = this.prepare(new EdgeList(config.definition.graph));
    }));
    this.subscriptions.push(this.config.centroids.subscribe(() => {
      if (this.graph != undefined && this.graph.nodes.length > 0) {
        this.abort.abort();
        this.abort = new AbortController();
        // Initial layout or render if no own layout
        this.render(this.graph, this.abort.signal); 
      }
    }));
    this.subscriptions.push(this.config.selectedConnections.subscribe(async () => {
      if (this.config.configuration.value.instance.graph.nodes.length > 0 && this.graph != undefined) {
        this.createNodes(this.graph);
        this.render(this.graph, this.abort.signal);
      }
    }));
    this.subscriptions.push(this.config.layoutSettings.subscribe(async () => {
      if (this.config.configuration.value.instance.graph.nodes.length > 0) {
        // Only for manual maybe
      }
    }));
    this.subscriptions.push(this.config.graphicsSettings.subscribe(() => {
      if (this.config.configuration.value.instance.graph.nodes.length > 0 && this.graph != undefined) {
        this.createNodes(this.graph);
        this.render(this.graph, this.abort.signal);
      }
    }));
    // A) Different kind of selected cluster
    // B) Different list mode as well for sync
    //    - based on active tab
    //    - no cluster creation/edit?
    //    - Horizontal split?
    //    - Predfined layout: Tabs or Combobox Vis select
    //    - Free layout: Golden layout - maybe not compatible with angular
    //    - highlight in NL
    //    - stronger highlight in list?
    //    - Adv NL vs mat: understanding edits (smooth anim vs reorder)
    this.subscriptions.push(this.config.selectedCluster.subscribe(c => {
      // Change circleSpacing atom sim stuff
      const highlight = false;
      if (c != undefined && highlight) {

      }
    }));
    this.subscriptions.push(this.config.level.subscribe(() => {

      // Implementation
      // - create nodes from centroids
      // - maybe prefer old centroid computation: gives centroids for higher order clusters
      // - 
      // - no layout pass on level change

      // Idea: need layout centroids, so always compute layout but change how nodes are rendered
      // - Maybe don't add nodes to stage
      // - Maybe extra SVG vis => send centroids to service or even compute layout there
      //   - New vis needs something like edge strength
      //   - New vis Might need more node encoding
      //   - New vis does not have to scale (hopefully?)
      //   - Ways to skip to minimap OR: morph into minimap for better overview
      //   - BUT: No smooth transition to node display in this arrangement - is that a problem or not?

      // Risk assessment:
      // - Can do anything in SVG
      // - Limits in raster: gradients?

      // Advantages of raster:
      // - only change nodes/render function
      // - no extra d3/svg handling
      // - maybe make more modular (starting positio, layout)

      // Options
      // A) Sync with matrix, aggregate lower levels into higher ones, but need one lower?
      // B) Switch between nodes/clusters

      // Convex hull when?

      // Minimap
      // - Specialized for 1:N
      // - Non-overlapping

      // Adaptive NL
      // - Incorporates everything into one
      // - Would be nice if not separate vis => can toggle nodes to clusters => how to draw? => any less confusing/benefit?

      // 1. Normal NL
      // 2. Aggregated levels
      // 3. Tree
      // 4. Minimap, ausblenden oder fade
      // 5. Circle packing / Hierarchical convex hulls
      // Idea: Animations to morph everything, even merging nodes to form clusters
      // Implementation: Lerp layoutPos to centroid pos or centroid to centroid or centroid to layout / layout target pos (circ pack) (how? -> don't, almost no benefit)
      // In one UI: Just fade between the canvases
      // Solution for full circle packing layout: ignore inter-community edges
      // Ignore general gravity
      // Gravity for every wanted centroid position

      // This could actually be it...
    }));
  }

  private prepare(graph: EdgeList): EdgeList {
    // Add other levels somewhere else (max dist from others)?
    // Or minimap + circle packing??
    // Or just be limited not working across levels
    // How about allowing top-down (but not bottom-up)?

    // TODO: Also 

    // When clicking on node: Lerp into minimap
    // Can also start from 
    // Specialized in 1:N editing and READING (common after adding new cluster)
    // MUST differentiate between generated edges and connections (care more about the latter because of editing)


    // Step 1: Node + edge scaling
    // Step 2: Lerp to minimap
    // Step 3: Minimap scaling
    // Step 4: Multilevel support

    graph.nodes = graph.nodes.filter(n => (n.data as Cluster).generator.name != "MG");
    graph.edges = graph.edges.filter(e => (e.source.data as Cluster).generator.name != "MG" && (e.target.data as Cluster).generator.name != "MG")
    this.createNodes(graph);

    return graph;
  }

  private createNodes(graph: EdgeList) {
    for (const gfx of this.nodeDict.values()) {
      gfx.destroy();
    }
    this.nodeDict.clear();

    const measures = this.config.measures.value.clusterMeasures;
    const sizes = [...measures.values()].map(m => m.nodeCount);
    const sizeExtent = d3.extent(sizes) as [number, number];
    const radiusScale = d3.scaleLinear().domain(sizeExtent).range(this.nodeRadiusRange);

    for (const node of graph.nodes) {
      const gfx = new PIXI.Graphics({ zIndex: 1 });
      const radius = radiusScale(measures.get(node.id)!.nodeCount);
      gfx.circle(0, 0, radius);

      // Alpha: This node has selected incident edges
      // const anySelection = this.config.selectedConnections.value.length > 0;
      // const alpha = !anySelection || selectedEdges.find(e => e.source == node || e.target == node) ? 1 : 0.2;
      const alpha = 1;

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


      };
      this.nodeDict.set(node, gfx);
      this.stage.addChild(gfx);
    }

    const extent = d3.extent(graph.edges.map(e => (e.data as ClusterConnection).edgeCount)) as [number, number];
    this.edgeWidthScale = d3.scaleLinear().domain(extent).range(this.edgeWidthRange);
  }

  private render(graph: EdgeList, signal: AbortSignal, timestamp?: number) {
    if (graph == undefined) {
      console.log("No graph");
      return;
    }

    if (this.app.canvas == undefined) {
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

    // Render edges
    this.edgeGraphics?.clear();    
    for (const edge of graph.edges) {
      const data = edge.data as ClusterConnection;
      const source = edge.source.data as Cluster;
      const target = edge.target.data as Cluster;

      if (data.edgeCount == 0) {
        return;
      }

      const sourcePos = this.config.centroids.value.get(source.id)!;
      const targetPos = this.config.centroids.value.get(target.id)!;

      // Transparency of unselected if there is an active selection
      // const alpha = !anySelection || selectedEdges.indexOf(edge) != -1 ? 1 : 0.2;
      const alpha = 1;

      const middle = {
        x: (sourcePos.x + targetPos.x) / 2,
        y: (sourcePos.y + targetPos.y) / 2
      };
      this.edgeGraphics.moveTo(sourcePos.x * this.edgeScale, sourcePos.y * this.edgeScale);
      this.edgeGraphics.lineTo(middle.x * this.edgeScale, middle.y * this.edgeScale);
      // this.getNodeColor(edge.source, settings.edgeColoring)
      this.edgeGraphics.stroke({width: this.edgeWidthScale(data.edgeCount), color: "black", alpha: alpha });
      this.edgeGraphics.moveTo(middle.x * this.edgeScale, middle.y * this.edgeScale);
      this.edgeGraphics.lineTo(targetPos.x * this.edgeScale, targetPos.y * this.edgeScale);
      this.edgeGraphics.stroke({width: this.edgeWidthScale(data.edgeCount), color: "black", alpha: alpha });
    }
    
    // Set node positions
    for (const node of graph.nodes) {
      const pos = this.config.centroids.value.get(node.id)!;
      let gfx = this.nodeDict.get(node)!;
      gfx.position = {
        x: pos.x * this.edgeScale,
        y: pos.y * this.edgeScale
      };

      // Change fill/tint depending on selection
      // Or re-create nodes in subject change subscription event

      // Kind of prefer tint here tbh (less calls other than render)
      // Or just call createNodes(), easy
    }
  }

  private getNodeColor(node: Node, communityColor: boolean = true): number | string {
    if (communityColor) {
      const cluster = node.data as Cluster;
      return cluster.color;
    } else {
      return 0x000000
    }
  }

  private circleSpacingInterpolation(start: number) {
    if (this.circleSpacingLerpStart == 0) {
      this.circleSpacingLerpStart = start + (this.circleSpacingNode ? this.circleSpacingLerp : 1 - this.circleSpacingLerp) * 1000;
    }
    const elapsed = Math.min(1000, start - this.circleSpacingLerpStart); // milliseconds
    if (this.circleSpacingLerp) {
      this.circleSpacingLerp = elapsed / 1000;
    } else {
      this.circleSpacingLerp = 1 - elapsed / 1000;
    }
    if (this.graph != undefined) {
      this.render(this.graph, this.abort.signal, start);
    }
    if (elapsed < 1000) {
      requestAnimationFrame(s => this.circleSpacingInterpolation(s));
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
        preference: 'webgpu',
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
