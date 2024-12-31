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
  private hoveredNode?: Node;
  private edgeGraphics!: PIXI.Graphics;
  private abort: AbortController = new AbortController();
  private labelGfx: Map<number, PIXI.Graphics> = new Map();
  private centroidLerp: number = 1;
  private centroidLerpTargetTime: number = 0;
  private centroidLerpTransitionTime: number = 500;
  private lastRenderTime: number = 0;
  private dragging = false;
  private dragTimeout = -1;

  private subscriptions: Subscription[] = [];

  @Input()
  public combineClusters = true;

  @Input()
  public nodeColor = true;

  @Input()
  public edgeColor = true;

  @Input()
  public nodeSize = false;

  @Input()
  public edgeHighlight = false;

  @Input()
  public labels = true;

  @Input()
  public transform = { value: new d3.ZoomTransform(1, 0, 0) };

  @ViewChild('container')
  private container!: ElementRef;
  @ViewChild('tooltip')
  private tooltip!: ElementRef;

  constructor(public config: ConfigurationService) {}

  private init() {
    this.subscriptions.push(this.config.sample.subscribe(graph => {
      this.abort.abort();
      this.abort = new AbortController();
      this.createNodes(graph);
    }));
    this.subscriptions.push(this.config.forceDirectedLayout.subscribe(graph => {
      this.render(graph, this.abort.signal);
    }));
    this.subscriptions.push(this.config.selectedCluster.subscribe(c => {
      if (this.config.forceDirectedLayout.value.nodes.length > 0 && !this.config.ignoreChanges) {
        this.render(this.config.forceDirectedLayout.value, this.abort.signal);
      }
    }));
    this.subscriptions.push(this.config.selectedConnections.subscribe(() => {
      if (this.config.forceDirectedLayout.value.nodes.length > 0 && !this.config.ignoreChanges) {
        this.createNodes(this.config.forceDirectedLayout.value);
        this.render(this.config.forceDirectedLayout.value, this.abort.signal);
      }
    }));
    this.subscriptions.push(this.config.diffusionNodeStates.subscribe(() => {
      if (this.config.forceDirectedLayout.value.nodes.length > 0 && !this.config.ignoreChanges) { // And not triggerd by diffusion due to config change (chaining), otherwise sampled/layout will be outdated -> flag
        this.createNodes(this.config.forceDirectedLayout.value);
        this.render(this.config.forceDirectedLayout.value, this.abort.signal);
      }
    }));
    this.subscriptions.push(this.config.hiddenClusters.subscribe(cs => {
      if (this.config.forceDirectedLayout.value.nodes.length > 0) {
        this.createNodes(this.config.forceDirectedLayout.value);
        this.render(this.config.forceDirectedLayout.value, this.abort.signal);
      }
    }));
    this.subscriptions.push(this.config.history.subscribe(c => {
      if (c.at(-1)?.message.startsWith("Rename")) {
        if (this.config.forceDirectedLayout.value.nodes.length > 0) {
          this.createNodes(this.config.forceDirectedLayout.value);
          this.render(this.config.forceDirectedLayout.value, this.abort.signal);
        } 
      }
    }));
  }

  private createNodes(graph: EdgeList) {
    for (const gfx of this.nodeDict.values()) {
      this.stage.removeChild(gfx);
      gfx.destroy();
    }
    this.nodeDict.clear();
    for (const gfx of this.labelGfx.values()) {
      this.stage.removeChild(gfx);
      gfx.destroy();
    }
    this.labelGfx.clear();
    this.hoveredNode = undefined;

    const degrees = this.config.measures.value.globalMeasures.degrees;
    const degreesExtent = d3.extent(degrees.values()) as [number, number];
    const radiusScale = d3.scaleLinear().domain(degreesExtent).range(this.nodeRadiusRange);

    const selectedEdges = [...this.config.configuration.value.instance.connections.entries()]
                              .filter(([k, v]) => this.config.selectedConnections.value.indexOf(k) != -1)
                              .flatMap(([k, v]) => v);

    for (const node of graph.nodes) {
      const cluster = this.getNodeCluster(node);
      if (this.config.hiddenClusters.value.has(cluster.id)) {
        continue;
      }
      const gfx = new PIXI.Graphics({ zIndex: 1 });
      let radius = this.nodeRadius;
      if (this.nodeSize) {
        radius = radiusScale(degrees.get(node)!);
      }
      gfx.circle(0, 0, radius);

      // Alpha: This node has selected incident edges
      // This does not only depend on cluster id, but must be from the correct edge bundle which makes things inefficient
      const anySelection = this.config.selectedConnections.value.length > 0;
      const diffusionSeed = this.config.diffusionNodeStates.value.get(node) == "infected";
      const state = this.config.diffusionNodeStates.value.get(node);
      const alpha = !this.edgeHighlight || !anySelection || selectedEdges.find(e => e.source == node || e.target == node) ? 1 : 0.2;

      // Node color for diffusion simulation
      let col: PIXI.ColorSource;
      if (diffusionSeed) { // implicit || state == 'infected'
        col = 0xFF00FF;
      } else if (state == 'contacted') {
        col = 0xFFFF00;
      } else if (state == 'refractory') {
        col = 0xFFFFFF;
      } else {
        col = this.getNodeColor(node, this.nodeColor);
      }

      gfx.stroke({ width: 3, color: 'black', alpha: alpha });
      gfx.fill({ color: col, alpha: alpha });
      gfx.interactive = true;
      gfx.onpointerenter = () => {
        gfx.tint = 0x9A9A9A;
        this.hoveredNode = node;
        if (!this.dragging) {
          this.render(graph, this.abort.signal);
        }
      }
      gfx.onpointermove = e => {
        if (!this.dragging) {
          this.showTooltip(e.client, cluster.name);
        }
      };
      gfx.onpointerleave = () => {
        this.hideTooltip();
        gfx.tint = 0xFFFFFF;
        this.hoveredNode = undefined;
        if (!this.dragging) {
          this.render(graph, this.abort.signal); 
        }
      }
      gfx.onclick = () => {
        const seeds = this.config.diffusionNodeStates.value;
        const state = seeds.get(node);
        if (state == "infected") {
          seeds.set(node, "susceptible");
          this.config.diffusionNodeStates.value.set(node, 'susceptible');
        } else {
          seeds.set(node, "infected");
          this.config.diffusionNodeStates.value.set(node, 'infected');
        }
        this.config.diffusionNodeStates.next(seeds);
      };
      this.nodeDict.set(node, gfx);
      this.stage.addChild(gfx);
    }

    if (this.labels) {
      for (const node of this.config.configuration.value.definition.graph.nodes.keys()) {
        const cluster = node.data as Cluster;
        const label = new PIXI.Text();
        label.text = cluster.name;
        label.style.fill = "white";
        label.position = {
          x: -label.width / 2,
          y: -label.height / 2
        };
        const background = new PIXI.Graphics();
        background.zIndex = 10000;
        background.rect(label.position.x, label.position.y, label.width, label.height);
        background.fill("black");
        background.addChild(label);
        this.labelGfx.set(node.id, background);
        this.stage.addChild(background);
      }
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

    // Join with selectedConnections to determine alpha/highlight value
    const anySelection = this.config.selectedConnections.value.length > 0;
    const selectedEdges = [...this.config.configuration.value.instance.connections.entries()]
                            .filter(([k, v]) => this.config.selectedConnections.value.indexOf(k) != -1)
                            .flatMap(([k, v]) => v);

    // Label
    if (this.labels) {
      for (const [id, centroid] of this.config.centroids.value) {
        const g = this.labelGfx.get(id);
        if (g != undefined) {
          g.position = {
            x: centroid.x * this.edgeScale,
            y: centroid.y * this.edgeScale
          };
        }
      }
    }

    // Set node positions
    // Lerp for possible cluster aggregation
    for (const node of graph.nodes) {
      const data = node.data as NodeData;
      if (this.config.hiddenClusters.value.has(data.clusterID)) {
        continue;
      }
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
    }

    // Render edges
    this.edgeGraphics.clear();
    for (const edge of graph.edges) {
      const data = edge.data as EdgeData;
      const source = edge.source.data as NodeData;
      const target = edge.target.data as NodeData;

      if (this.config.hiddenClusters.value.has(source.clusterID) || this.config.hiddenClusters.value.has(target.clusterID)) {
        continue;
      }
      
      const hover = edge.source == this.hoveredNode || edge.target == this.hoveredNode;
      const selected = selectedEdges.indexOf(edge) != -1;
      const seedSource = this.config.diffusionNodeStates.value.get(edge.source) == "infected";
      const seedTarget = this.config.diffusionNodeStates.value.get(edge.target) == "infected";
      const diffusionSeeds = seedSource && seedTarget;

      // Transparency of unselected if there is an active selection
      const alpha = !this.edgeHighlight || hover || !anySelection || selected ? 1 : 0.2;

      const middle = {
        x: (source.renderPosition.x + target.renderPosition.x) / 2,
        y: (source.renderPosition.y + target.renderPosition.y) / 2
      };
      this.edgeGraphics.moveTo(source.renderPosition.x * this.edgeScale, source.renderPosition.y * this.edgeScale);
      this.edgeGraphics.lineTo(middle.x * this.edgeScale, middle.y * this.edgeScale);
      this.edgeGraphics.stroke({width: 1, color: hover || diffusionSeeds ? 0xFF00FF : this.getNodeColor(edge.source, this.edgeColor), alpha: alpha });
      this.edgeGraphics.moveTo(middle.x * this.edgeScale, middle.y * this.edgeScale);
      this.edgeGraphics.lineTo(target.renderPosition.x * this.edgeScale, target.renderPosition.y * this.edgeScale);
      this.edgeGraphics.stroke({width: 1, color: hover || diffusionSeeds ? 0xFF00FF : this.getNodeColor(edge.target, this.edgeColor), alpha: alpha });
    }
    
    // Render convex hull
    if (this.config.selectedCluster.value != undefined && !this.config.hiddenClusters.value.has(this.config.selectedCluster.value.id)) {
      const cluster1 = this.config.configuration.value.instance.clusters.get(this.config.selectedCluster.value.id)?.nodes;
      if (cluster1 == undefined || cluster1.length < 3) {
        return;
      }
      const points: [number, number][] = cluster1.map(n => {
        const data = n.data as NodeData;
        return [data.renderPosition.x, data.renderPosition.y];
      });
      const hull = d3.polygonHull(points)!;
      for (let i = 0; i < hull.length; i++) {
        const point1 = hull[i];
        const point2 = hull[i == hull.length - 1 ? 0 : (i + 1)];
        this.edgeGraphics.moveTo(point1[0] * this.edgeScale, point1[1] * this.edgeScale);
        this.edgeGraphics.lineTo(point2[0] * this.edgeScale, point2[1] * this.edgeScale);
      }
      this.edgeGraphics.stroke({ width: 4, color: 0x222222 });
    }
  }

  private getNodeCluster(node: Node): Cluster {
    const data = node.data as NodeData;
    const clusterNode = this.config.configuration.value.definition.graph.nodeDictionary.get(data.clusterID)!;
    const cluster = clusterNode.data as Cluster;
    return cluster;
  }

  private getNodeColor(node: Node, communityColor: boolean = true): number | string {
    if (communityColor) {
      return this.getNodeCluster(node).color;
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
      this.app.canvas.oncontextmenu = e => {
        e.preventDefault();
      }
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
        clearTimeout(this.dragTimeout);
        this.dragTimeout = setTimeout(() => {
          this.dragging = false;
        }, 100);
        this.dragging = true;
        this.zoom(this.transform.value);
      }
    }
    if ((changes["nodeColor"] || changes["edgeColor"] || changes["nodeSize"] || changes["edgeHighlight"] || changes["labels"])) {
      if (this.stage != undefined && this.config.forceDirectedLayout.value.nodes.length > 0) {
        this.createNodes(this.config.forceDirectedLayout.value);
        this.render(this.config.forceDirectedLayout.value, this.abort.signal);
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

  private showTooltip(pos: Point, text: string) {
    d3.select(this.tooltip.nativeElement)
      .text(text)
      .style("display", "inline-block")
      .style("left", `${pos.x - this.rect.x + 20}px`)
      .style("top", `${pos.y - this.rect.y + 20}px`);
  }

  private hideTooltip() {
    d3.select(this.tooltip.nativeElement)
      .text("")
      .style("display", "none")
      .style("top", "-100px")
      .style("left", "-100px");
  }
}
