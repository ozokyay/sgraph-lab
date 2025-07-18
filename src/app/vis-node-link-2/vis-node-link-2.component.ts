import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, Input, OnChanges, SimpleChanges } from '@angular/core';
import { ConfigurationService } from '../configuration.service';
import { Edge, EdgeData, EdgeList, Node, NodeData } from '../graph';
import * as PIXI from 'pixi.js';
import * as d3 from 'd3';
import { Utility } from '../utility';
import Rand from 'rand-seed';
import { Cluster } from '../cluster';
import { Point } from '../point';
import { ClusterConnection, EmptyConnection } from '../cluster-connection';
import { max, Subscription } from 'rxjs';

@Component({
  selector: 'app-vis-node-link-2',
  standalone: true,
  imports: [],
  templateUrl: './vis-node-link-2.component.html',
  styleUrl: './vis-node-link-2.component.css'
})
export class VisNodeLink2Component implements AfterViewInit, OnChanges, OnDestroy {

  private edgeScale = 500;
  private nodeRadiusRange = [50, 150];
  private edgeWidthRange = [10, 40]

  private app!: PIXI.Application;
  private stage!: PIXI.Container;
  private rect!: DOMRect;
  private width: number = 0;
  private height: number = 0;
  private nodeDict: Map<Node, [PIXI.Graphics, number]> = new Map();
  private edgeGraphics: PIXI.Graphics[] = [];
  private edgeGraphics2!: PIXI.Graphics;
  private draggingEdge!: PIXI.Graphics;
  private radiusScale!: d3.ScaleLinear<number, number>;
  private graph?: EdgeList = undefined;
  private abort: AbortController = new AbortController();
  private abortRender: AbortController = new AbortController();
  private abortLevel: AbortController = new AbortController();
  private edgeWidthScale!: d3.ScaleLinear<number, number, never>;
  private circleLayoutActive = false;
  private circleLayoutCenter?: Node = undefined;
  private circleLayoutLerp: number = 0;
  private circleSpacingLerpTarget: number = 0;
  private lastRenderTime: number = 0;
  private dragging = false;
  private dragTimeout = -1;

  private currentLevel = 1;
  private speed = 1 / 500;
  private lastLevelTime = 0;
  private lastFrameTime = 0;

  public isDraggingEdge = false;
  private draggingEdgeSourceNode?: Node;
  private draggingEdgeSourcePos: Point = { x: 0, y: 0 };

  @Input()
  public transform = { value: new d3.ZoomTransform(1, 0, 0) };

  @Input()
  public level: number = 1;

  @Input()
  public circularLayout = false;
  
  @Input()
  public nodeColor = true;

  @Input()
  public edgeColor = true;

  @Input()
  public nodeSize = false;

  @Input()
  public edgeRatio = true;

  @Input()
  public createEdges = true;

  @Input()
  public labels = true;

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
      if (this.circleLayoutCenter != undefined && !config.definition.graph.nodes.has(this.circleLayoutCenter)) {
        this.reset();
      }
      this.graph = this.prepare(new EdgeList(config.definition.graph));
    }));
    this.subscriptions.push(this.config.centroids.subscribe(() => {
      if (this.graph != undefined && this.graph.nodes.length > 0) {
        this.abortRender.abort();
        this.abortRender = new AbortController();
        // Initial layout or render if no own layout
        this.render(this.graph, this.abortRender.signal); 
      }
    }));
    this.subscriptions.push(this.config.selectedConnections.subscribe(async () => {
      if (this.config.configuration.value.instance.graph.nodes.length > 0 && this.graph != undefined) {
        this.createNodes(this.graph);
        this.render(this.graph, this.abortRender.signal);
      }
    }));
    this.subscriptions.push(this.config.layoutSettings.subscribe(async () => {
      if (this.config.configuration.value.instance.graph.nodes.length > 0) {
        // Only for manual maybe
      }
    }));
    this.subscriptions.push(this.config.activeTab.subscribe(t => {
      // if (t != 2) {
      //   this.reset();
      // }
    }));
    this.subscriptions.push(this.config.selectedCluster.subscribe(c => {
      if (this.graph != undefined) {
        if (this.circularLayout) {
          if (c != undefined) {
            const node = this.config.configuration.value.definition.graph.nodeDictionary.get(c.id)!;
            const cluster = node.data as Cluster;
            let level;
            const entry = this.nodeDict.get(node);
            if (entry != undefined) {
              level = entry[1];
            } else {
              const depths = Utility.getNodeDepths(this.config.configuration.value.definition.graph);
              level = depths.find(([n, d]) => n == node)![1];
            }
            if (cluster == this.config.selectedCluster.value || level == this.level || (cluster.children.length == 0 && level < this.level)) {
              this.circleLayoutLerp = 0;
              this.centerCluster(node);
            } else {
              this.centerCluster(undefined);
            }
          } else {
            this.centerCluster(undefined);
          }
        } else {
          this.reset();
        }

        this.createNodes(this.graph);
        this.render(this.graph, this.abortRender.signal);
      }
    }));
    this.subscriptions.push(this.config.hiddenClusters.subscribe(cs => {
      if (this.graph != undefined && this.stage != undefined && this.graph.nodes.length > 0) {
        this.createNodes(this.graph);
        this.render(this.graph, this.abortRender.signal);
      }
    }));
    this.subscriptions.push(this.config.pointerUp.subscribe(() => {
      this.isDraggingEdge = false;
      this.draggingEdge?.clear();
    }));
    this.subscriptions.push(this.config.history.subscribe(c => {
      if (c.at(-1)?.message.startsWith("Rename")) {
        if (this.graph != undefined && this.stage != undefined && this.graph.nodes.length > 0) {
          this.createNodes(this.graph);
          this.render(this.graph, this.abortRender.signal);
        } 
      }
    }));
  }

  private reset() {
    this.abort.abort(); // Actually useless
    this.abort = new AbortController();
    this.circleLayoutLerp = 0;
    this.circleLayoutCenter = undefined;
  }

  private prepare(graph: EdgeList): EdgeList {
    // Need all nodes and edges here, lerp position and alpha in render()
    this.createNodes(graph);
    return graph;
  }

  private createNodes(graph: EdgeList) {
    for (const [gfx, _] of this.nodeDict.values()) {
      gfx.destroy();
    }
    this.nodeDict.clear();

    const measures = this.config.measures.value.clusterMeasures;
    const sizes = [...measures.values()].map(m => m.nodeCount);
    const sizeExtent = d3.extent(sizes) as [number, number];
    this.radiusScale = d3.scaleLinear().domain(sizeExtent).range(this.nodeRadiusRange);

    const levels = Utility.getNodeDepths(this.config.configuration.value.definition.graph);

    this.zoom(this.transform.value);

    for (const [node, level] of levels) {
      // Skip hidden
      if (this.config.hiddenClusters.value.has(node.id)) {
        continue;
      }

      const cluster = node.data as Cluster;
      const gfx = new PIXI.Graphics();
      const radius = this.nodeSize ? this.radiusScale(measures.get(node.id)!.nodeCount) : (this.nodeRadiusRange[0] + this.nodeRadiusRange[1]) / 2;
      const alpha = 1;

      gfx.clear();
      gfx.circle(0, 0, radius);
      if (this.config.selectedCluster.value != undefined && node.id == this.config.selectedCluster.value.id) {
        gfx.stroke({ width: 40, color: 0x222222, alpha: alpha });
      } else {
        gfx.stroke({ width: 3, color: 'black', alpha: alpha });
      }
      gfx.fill({ color: this.getNodeColor(node, true), alpha: alpha }); // No color makes no sense
      gfx.interactive = true;
      gfx.onpointermove = e => {
        if (!this.dragging) {
          this.showTooltip(e.client, (node.data as Cluster).name);
          gfx.tint = 0x9A9A9A;
        }
      };
      gfx.onpointerleave = () => {
        this.hideTooltip();
        gfx.tint = 0xFFFFFF;
      }
      gfx.onclick = () => {
        // Select cluster
        if (this.config.selectedCluster.value == cluster) {
          this.config.selectedCluster.next(undefined);
        } else {
          this.config.selectedCluster.next(cluster);
        }
      };
      gfx.onpointerdown = () => {
        if (!this.createEdges) {
          return;
        }
        this.isDraggingEdge = true;
        this.draggingEdgeSourceNode = node;
        this.draggingEdgeSourcePos = gfx.position; // Also need node for edge, use dict to lookup pos
      };
      gfx.onpointerup = () => {
        if (this.isDraggingEdge && node != this.draggingEdgeSourceNode && gfx.alpha > 0 && this.draggingEdgeSourceNode != undefined) {
          this.selectOneOne(node, this.draggingEdgeSourceNode, false, false);
          this.isDraggingEdge = false;
        }
      };
      gfx.onrightclick = (e: MouseEvent) => {
        // Attributes
        // - Numerical (can later be converted to categorical)
        // - Nodes only
        // - Own tab, each attribute for all nodes for whole graph (add, delete, name, color, range?)
        // - Distribution per cluster: annoying but powerful
        // - Assortativity within cluster: heuristic from auto spread on whole graph
        // - At least one seed per connected component
        // - Seeds: random? set amount?
        // - On nodes: for connecting clusters
        // - measures?
        // - tooltips?
        // - vis radius and vis color, attr selection
        // - list of expandable cards, name editable, can select highlight mode from there

        // TODO
        // - SIR
        // - More symmetry matrix/NL
        // - Tooltips edges/matrix
        // - Selectable expandable edges list with buttons?
        // - Legend min/max node size, min/max edge width

        // - Explain why no matrix mode for single level needed (higher levels very few nodes don't matter)
        // - Extra assortativity edges
        // - Attribute

        this.selectEdges(node, e.shiftKey);
      };
      this.nodeDict.set(node, [gfx, level]);
      this.stage.addChild(gfx);

      // Label
      if (this.labels) {
        const label = new PIXI.Text();
        label.text = cluster.name;
        label.style.fill = "white";
        label.position = {
          x: -label.width / 2,
          y: -label.height / 2
        };
        const background = new PIXI.Graphics();
        background.rect(label.position.x, label.position.y, label.width, label.height);
        background.fill("black");
        gfx.addChild(background);
        gfx.addChild(label);
      }
    }

    const extent = d3.extent(graph.edges.map(e => (e.data as ClusterConnection).edgeCount)) as [number, number];
    this.edgeWidthScale = d3.scaleLinear().domain(extent).range(this.edgeWidthRange);
  }

  private selectEdges(node: Node, toggle: boolean) {
    // Select cluster for edit
    const selectedCluster = this.config.selectedCluster.value;
    if (selectedCluster == undefined || this.graph == undefined) {
      return;
    }
    const selectedNode = this.config.configuration.value.definition.graph.nodeDictionary.get(selectedCluster.id)!;
    // Cannot do spooky selection from invisible level
    // const [_, level] = this.nodeDict.get(selectedNode)!;
    // if (level != this.level && (selectedCluster.children.length > 0 || level > this.level)) {
    //   return;
    // }

    if (selectedNode == node) {
      // 1:N
      // Get respective edges
      const selection = (this.config.selectedConnections.value
        .map((e, i) => [e, i]) as [Edge, number][])
        .filter(([e, i]) => e.source == selectedNode || e.target == selectedNode);

      // Same behavior as 1:1 but broadcast to 1:N

      // Deselect
      if (selection.length > 0) {
        if (toggle) {
          for (const [e, i] of selection) {
            Utility.swapEdge(e);
          }
        } else {
          for (const [e, i] of selection.reverse()) {
            this.config.selectedConnections.value.splice(i, 1);
          }
        }
      } else {
        // Add missing
        // Search through all real edges
        const edges = this.config.configuration.value.definition.graph.nodes.get(selectedNode)!;
        for (const other of this.config.configuration.value.definition.graph.getNodes()) {
          if (this.config.hiddenClusters.value.has(other.id)) {
            continue;
          }
          const [_, level] = this.nodeDict.get(other)!;
          if (other == selectedNode || this.config.hiddenClusters.value.has(other.id) || (level != this.level && ((other.data as Cluster).children.length > 0 || level > this.level))) {
            continue;
          }

          const entry = edges.find(([e, v]) => v.id == other.id); // This could be handled by service or tab-cluster-list
          let edge = entry != undefined ? entry[0] : undefined;
    
          // Check selected
          if (edge == undefined) {
            edge = this.config.selectedConnections.value.find(e => e.source == selectedNode && e.target == other || e.source == selectedNode && e.target == other);
          }
    
          // Create
          if (edge == undefined) {
            edge = { source: selectedNode, target: other, data: structuredClone(EmptyConnection) };
          }

          if ((edge.source == selectedNode || edge.target == selectedNode) && selection.find(([e, i]) => e == edge) == undefined) {
            if (selectedNode != edge.source) {
              Utility.swapEdge(edge);
            }
            this.config.selectedConnections.value.push(edge);
          }
        }
      }
      this.config.selectedConnections.next(this.config.selectedConnections.value);
      return;
    }

    // 1:1
    this.selectOneOne(node, selectedNode, true, toggle);
  }

  private selectOneOne(node: Node, selectedNode: Node, deselect: boolean, toggle: boolean) {
    // Deselect
    const selectedEdge = this.config.selectedConnections.value.find(e => e.source == selectedNode && e.target == node || e.source == node && e.target == selectedNode);
    if (selectedEdge != undefined) {
      if (deselect) {
        if (toggle) {
          Utility.swapEdge(selectedEdge);
        } else {
          this.config.selectedConnections.value.splice(this.config.selectedConnections.value.indexOf(selectedEdge), 1);
        }
        this.config.selectedConnections.next(this.config.selectedConnections.value);
      }
      return;
    }

    // Select
    // Check graph
    const edges = this.config.configuration.value.definition.graph.nodes.get(selectedNode)!;
    const entry = edges.find(([e, v]) => v.id == node.id); // This could be handled by service or tab-cluster-list
    let edge = entry != undefined ? entry[0] : undefined;

    // Check selected
    if (edge == undefined) {
      edge = this.config.selectedConnections.value.find(e => e.source == selectedNode && e.target == node || e.source == selectedNode && e.target == node);
    }

    // Create
    if (edge == undefined) {
      edge = { source: selectedNode, target: node, data: structuredClone(EmptyConnection) };
    }

    if (selectedNode != edge.source) {
      Utility.swapEdge(edge);
    }
    this.config.selectedConnections.value.push(edge);
    this.config.selectedConnections.next(this.config.selectedConnections.value);
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

    this.zoom(this.transform.value);

    const upper = Math.ceil(this.currentLevel);
    const lower = Math.floor(this.currentLevel);

    // Level positions
    for (const node of graph.nodes) {
      const cluster = node.data as Cluster;
      if (this.config.hiddenClusters.value.has(node.id)) {
        continue;
      }
      const entry = this.nodeDict.get(node);
      if (!entry) {
        continue;
      }
      const [gfx, level] = entry;
      gfx.zIndex = 1000 - level;
      gfx.position = this.calculateBasePos(node, level, upper, lower);

      // Opacity
      if (cluster != this.config.selectedCluster.value && (cluster.children.length > 0 || level > this.level)) {
        if (level == upper) {
          gfx.alpha = this.currentLevel == upper ? 1 : this.currentLevel - lower;
        } else if (level == lower) {
          gfx.alpha = this.currentLevel == lower ? 1 : upper - this.currentLevel;
        } else if (this.level == 0 && cluster.children.length == 0) { // keep selected visible: || cluster == this.config.selectedCluster.value
          gfx.alpha = 1;
        } else {
          gfx.alpha = 0;
        }
      }

      // If spawned in by selection
      if (cluster == this.config.selectedCluster.value && level != this.level && (cluster.children.length > 0 || level > this.level)) {
        gfx.alpha = 0.5;
      }

      gfx.interactive = gfx.alpha > 0;

      // Overlap prevention
      // -> Why not multilevel layout in the first place
      // -> Lerp all the way
      // -> Use tl positions as starting points instead of random
      // -> Also in service, basically iterative ForceDirected()

      // -> Easier: Force sim on current level without edges until overlap free
    }

    // Circular
    if (this.circleLayoutCenter != undefined && !this.config.hiddenClusters.value.has(this.circleLayoutCenter.id)) {
      let centerPos = this.nodeDict.get(this.circleLayoutCenter)![0].position;
      const anglesList: [PIXI.Graphics, number, number][] = [];

      if (graph.nodes.length > 1) {
        for (const node of graph.nodes) {
          if (node == this.circleLayoutCenter || this.config.hiddenClusters.value.has(node.id)) {
            continue;
          }
    
          const [gfx, level] = this.nodeDict.get(node)!;
          const cluster = node.data as Cluster;
          if (cluster != this.config.selectedCluster.value && level != this.level && (cluster.children.length > 0 || level > this.level)) {
            continue;
          }
          const gfxVec = Utility.subtractP(gfx.position, centerPos);
          // Get angle on unit circle
          const alpha = Math.atan2(gfxVec.y, gfxVec.x) + Math.PI;
          anglesList.push([gfx, alpha, 0]);
        }
      }

      // let radius = this.nodeRadiusRange[1] * (1 / Math.tan(Math.PI / anglesList.length));

      let radius = this.nodeRadiusRange[1] * (1 / Math.sin(Math.PI / anglesList.length) - 1) + this.nodeRadiusRange[1];
      radius = Math.max(1000, radius);

      const mod = (a: number, n: number) => a - Math.floor(a / n) * n;
      const dist = (a: number, b: number) => {
        const abs = Math.abs(a - b);
        if (abs > Math.PI)
          return Math.min(a, b) - (Math.max(a, b) - 2 * Math.PI);
        else
          return abs;
      };
  
      const min = 2 * Math.asin(this.nodeRadiusRange[1] / radius);
      let moved;
      let it = 0;
      do
      {
        it++;
        moved = false;
        // Compute forces
        for (let i = 0; i < anglesList.length; i++) {
          for (let j = 0; j < i; j++) {
            if (i == j) {
              continue;
            }
            const a = anglesList[i];
            const b = anglesList[j];
            const d = dist(a[1], b[1]);
            // console.log(`c1: ${a[0]} c2: ${b[0]} a: ${a[1]} b: ${b[1]} d: ${d}`);
            // const min = 0.3 * 1000 / radius;

            if (d < min) {
              let ax = a[1];
              let bx = b[1];
              if (Math.abs(ax - bx) > Math.PI) {
                if (a[1] > b[1])
                  ax -= 2 * Math.PI;
                else
                  bx -= 2 * Math.PI;
              }
              let direction = Math.sign(ax - bx);
              // a[2] += Math.min(1 / d, 0.1 * 1000 / radius) * direction; // Maybe want 1 / (100 * d)
              // b[2] += Math.min(1 / d, 0.1 * 1000 / radius) * -direction;
              a[2] += 0.5 * (min - d) * direction; // Maybe want 1 / (100 * d)
              b[2] += 0.5 * (min - d) * -direction;

              // console.log(`${a[1]}, ${b[1]} : ${a[2]}, ${b[2]} : ${d}`);
              moved = true;
            }
            // console.log(a[1] * 180 / Math.PI + " " + b[1] * 180 / Math.PI + " " + dist(a[1], b[1]) * 180 / Math.PI);
            // console.log(a[1] * 180 / Math.PI + " " + b[1] * 180 / Math.PI + " " + dist(b[1], a[1]) * 180 / Math.PI);
          }
        }
        // Apply forces
        for (const angle of anglesList) {
          angle[1] = mod(angle[1] + angle[2], 2 * Math.PI);
          angle[2] = 0;
        }
      } while (moved && it < 200);
      // console.log("Egocentric iterations: " + it);

      // Circle lerp
      for (const [gfx, angle, _] of anglesList) {
        const circlePos = Utility.addP(centerPos, this.circlePosition(angle - Math.PI, radius))
        gfx.position = Utility.lerpP(gfx.position, circlePos, this.circleLayoutLerp);
      }
    }

    // for (const node of graph.nodes) {
    //   const cluster = node.data as Cluster;
    //   const [gfx, level] = this.nodeDict.get(node)!;
    //   if (level > this.level && this.currentLevel == this.level && cluster.parent != -1) {
    //     const [pgfx, plevel] = this.nodeDict.get(this.config.configuration.value.definition.graph.nodeDictionary.get(cluster.parent)!)!
    //     gfx.position = pgfx.position;
    //   }
    // }

    // Render edges
    // TODO: Handle click event to select/deselect
    for (const gfx of this.edgeGraphics) {
      gfx.destroy();
    }
    this.edgeGraphics = [];
    this.edgeGraphics2?.clear();
    for (const edge of graph.edges) {
      const data = edge.data as ClusterConnection;
      const source = edge.source.data as Cluster;
      const target = edge.target.data as Cluster;

      if (data.edgeCount == 0 || this.config.hiddenClusters.value.has(source.id) || this.config.hiddenClusters.value.has(target.id)) {
        continue;
      }

      const [sourceGraphics, sourceLevel] = this.nodeDict.get(edge.source)!;
      const [targetGraphics, targetLevel] = this.nodeDict.get(edge.target)!;

      // Radius could be saved somewhere
      const midRadius = (this.nodeRadiusRange[0] + this.nodeRadiusRange[1]) / 2;
      const sourceRadius = this.nodeSize ? this.radiusScale(this.config.configuration.value.instance.clusterMeasures.get(edge.source.id)!.nodeCount) : midRadius;
      const targetRadius = this.nodeSize ? this.radiusScale(this.config.configuration.value.instance.clusterMeasures.get(edge.target.id)!.nodeCount) : midRadius;

      const sourcePos = Utility.addP(sourceGraphics.position, Utility.scalarMultiplyP(sourceRadius, Utility.normalizeP(Utility.subtractP(targetGraphics.position, sourceGraphics.position))));
      const targetPos = Utility.addP(targetGraphics.position, Utility.scalarMultiplyP(targetRadius, Utility.normalizeP(Utility.subtractP(sourceGraphics.position, targetGraphics.position))));

      // 6. dashed lines (effective edges, maybe prefer grey)
      // 7. keybinds
      // 8. labels on nodes
      // 12. attributes
      // 16. Labels in vis and hover for attributes, cluster color select (5 buttons), warning editing hidden edges

      // Problem: How to show edges on lower levels?
      // => Parents are not visible, so would need to show substitute edges
      // => But don't because would be confusing

      // Idea: Dashed lines for off-level effective connections

      // Problem 2: Graphics settings? -> Ignore because of no benefit

      // Problem 3: Overlap -> min distance maybe force directed or simple multi level variant (scaling spread will be hard, maybe just try it out? possible tuning params?)
      // => think about force sim vs multi level

      // Problem 4: Multiple maps can cause conflicting highlight in list -> deselect in all other instances

      // The question is: Can different visualizations by synchronized?
      // - Matrix and minimap: no
      // - Matrix and normal nl: yes
      // - Cluster list and minimap: yes
      // - Cluster list and matrix: no

      // Ways to handle:
      // a) deselect on interaction with other (confusing, unintuitive, not helpful)
      // b) show but don't provide interaction (easy to implement)
      // c) provide clunky alternative interaction (better for study to compare)
      // d) no interaction in list, display only

      // -> N:M and different directions
      // -> select first and second node OR select actual edge
      // -> both can have problems with overlap, can ignore for now

      // Keep selected, fade out unselected from active selection
      const selected = this.config.selectedConnections.value.find(c => c == edge) != undefined;
      const sourceAlpha = source == this.config.selectedCluster.value ? 1 : sourceGraphics.alpha;
      const targetAlpha = target == this.config.selectedCluster.value ? 1 : targetGraphics.alpha;
      let alpha = Math.min(sourceAlpha, targetAlpha);
      if (!selected && source != this.circleLayoutCenter?.data && target != this.circleLayoutCenter?.data) {
        alpha = Utility.lerp(alpha, 0, this.circleLayoutLerp);
      }

      const w = graph.edges.find(e => (e.data as ClusterConnection).edgeCount > 1) ? this.edgeWidthScale(data.edgeCount) : this.edgeWidthRange[0]; // Assuming linear scale
      const c = selected ? "yellow" : "black";
      const ratio = this.edgeRatio ? data.sourceNodeCount / data.targetNodeCount : 1;
      const wSource = Math.min(ratio * w, w);
      const wTarget = Math.min(1 / ratio * w, w);
      const dir = Utility.subtractP(targetPos, sourcePos);
      let perp: Point = {
        x: dir.y,
        y: -dir.x
      };
      perp = Utility.normalizeP(perp);
      const poly = this.enlargePolygon([sourcePos, sourcePos, targetPos, targetPos], perp, wSource, wTarget);
      const poly2 = this.enlargePolygon([sourcePos, sourcePos, targetPos, targetPos], perp, 40, 40);
      const gfx = new PIXI.Graphics();
      gfx.poly(poly);
      gfx.fill({ color: "black", alpha: alpha });
      gfx.stroke({ color: c, width: 6, alpha: alpha });
      gfx.hitArea = new PIXI.Polygon(poly2);
      gfx.interactive = alpha > 0.5;
      gfx.onclick = () => {
        this.selectOneOne(edge.target, edge.source, true, false);
      };
      gfx.onrightclick = () => {
        this.selectOneOne(edge.target, edge.source, true, true);
      };
      this.edgeGraphics.push(gfx);
      this.stage.addChild(gfx);

      if (selected) {
        this.directionIndicators(sourcePos, targetPos, alpha);
      }
    }

    // Potential edges or highlight edge selection
    for (const edge of this.config.selectedConnections.value) {
      if ((edge.data as ClusterConnection).edgeCount > 0 || this.config.hiddenClusters.value.has(edge.source.id) || this.config.hiddenClusters.value.has(edge.target.id)) {
        continue;
      }

      const [sourceGraphics, sourceLevel] = this.nodeDict.get(edge.source)!;
      const [targetGraphics, targetLevel] = this.nodeDict.get(edge.target)!;
      const midRadius = (this.nodeRadiusRange[0] + this.nodeRadiusRange[1]) / 2;
      const sourceRadius = this.nodeSize ? this.radiusScale(this.config.configuration.value.instance.clusterMeasures.get(edge.source.id)!.nodeCount) : midRadius;
      const targetRadius = this.nodeSize ? this.radiusScale(this.config.configuration.value.instance.clusterMeasures.get(edge.target.id)!.nodeCount) : midRadius;

      const sourcePos = Utility.addP(sourceGraphics.position, Utility.scalarMultiplyP(sourceRadius, Utility.normalizeP(Utility.subtractP(targetGraphics.position, sourceGraphics.position))));
      const targetPos = Utility.addP(targetGraphics.position, Utility.scalarMultiplyP(targetRadius, Utility.normalizeP(Utility.subtractP(sourceGraphics.position, targetGraphics.position))));

      const sourceAlpha = edge.source.data == this.config.selectedCluster.value ? 1 : sourceGraphics.alpha;
      const targetAlpha = edge.target.data == this.config.selectedCluster.value ? 1 : targetGraphics.alpha;
      const alpha = Math.min(sourceAlpha, targetAlpha);
      const black = { width: 3, color: "black", alpha: alpha };
      const yellow = { width: 6, color: "yellow", alpha: alpha };

      const dir = Utility.subtractP(targetPos, sourcePos);
      let perp: Point = {
        x: dir.y,
        y: -dir.x
      };
      perp = Utility.normalizeP(perp);
      const gfx = new PIXI.Graphics();
      const poly = this.enlargePolygon([sourcePos, sourcePos, targetPos, targetPos], perp, 40, 40);
      gfx.hitArea = new PIXI.Polygon(poly);
      gfx.interactive = true;
      gfx.onclick = () => {
        this.selectOneOne(edge.target, edge.source, true, false);
      };
      gfx.onrightclick = () => {
        this.selectOneOne(edge.target, edge.source, true, true);
      };
      this.dashedLine(gfx, sourcePos, targetPos, 24, 12);
      gfx.stroke(yellow);
      this.dashedLine(gfx, sourcePos, targetPos, 24, 12);
      gfx.stroke(black);
      this.edgeGraphics.push(gfx);
      this.stage.addChild(gfx);
      this.directionIndicators(sourcePos, targetPos, alpha);
    }
  }

  private enlargePolygon([p1, p2, p3, p4]: [Point, Point, Point, Point], n: Point, w1: number, w2: number): [Point, Point, Point, Point] {
    const q1 = Utility.addP(p1, Utility.scalarMultiplyP(w1 / 2, n));
    const q2 = Utility.addP(p2, Utility.scalarMultiplyP(-w1 / 2, n));
    const q3 = Utility.addP(p3, Utility.scalarMultiplyP(-w2 / 2, n));
    const q4 = Utility.addP(p4, Utility.scalarMultiplyP(w2 / 2, n));
    return [q1, q2, q3, q4];
  }

  private calculateBasePos(node: Node, level: number, upper: number, lower: number) {
    const pos = this.config.centroids.value.get(node.id) ?? { x: 0, y: 0 };
    let result: Point = {
      x: pos.x * this.edgeScale,
      y: pos.y * this.edgeScale
    };

    if (level > 1 && this.level > 0 && node.data != this.config.selectedCluster.value) {
      const cluster = node.data as Cluster;
      const parent = cluster.parent;
      const parentPos = this.config.centroids.value.get(parent) ?? { x: 0, y: 0 };
      const scaledParentPos = {
        x: parentPos.x * this.edgeScale,
        y: parentPos.y * this.edgeScale
      }
      let lerp = this.currentLevel - level + 1;
      lerp = Math.min(1, Math.max(0, lerp));

      result = Utility.lerpP(scaledParentPos, result, lerp);
    }

    return result;
  }

  private circlePosition(angle: number, radius: number): Point {
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    };
  }

  private directionIndicators(sourcePos: Point, targetPos: Point, alpha: number) {
    const normDir = Utility.normalizeP(Utility.subtractP(targetPos, sourcePos));
    const targetDirectionIndicator = Utility.addP(targetPos, Utility.scalarMultiplyP(17, normDir));
    const sourceDirectionIndicator = Utility.addP(sourcePos, Utility.scalarMultiplyP(-17, normDir));
    this.edgeGraphics2.circle(sourceDirectionIndicator.x, sourceDirectionIndicator.y, 12);
    this.edgeGraphics2.fill({ color: "yellow", alpha: alpha });
    this.edgeGraphics2.circle(targetDirectionIndicator.x, targetDirectionIndicator.y, 12);
    this.edgeGraphics2.stroke({ width: 4, color: "yellow", alpha: alpha });
  }

  private getNodeColor(node: Node, communityColor: boolean = true): number | string {
    if (communityColor) {
      const cluster = node.data as Cluster;
      return cluster.color;
    } else {
      return 0x000000
    }
  }

  private levelInterpolation(time: number, abort: AbortSignal) {
    if (abort.aborted) {
      return;
    }
    const dir = Math.sign(this.level - this.currentLevel);
    if (this.lastLevelTime == 0) {
      this.lastLevelTime = time;
    }
    const delta = dir * (time - this.lastLevelTime) * this.speed;
    this.lastLevelTime = time;
    const newLevel = this.currentLevel + delta;
    if (dir > 0)
      this.currentLevel = Math.min(this.level, newLevel);
    else if (dir < 0)
      this.currentLevel = Math.max(this.level, newLevel);
    if (this.graph != undefined) {
      this.render(this.graph, this.abortRender.signal, time);
    }
    if (this.currentLevel != this.level) {
      requestAnimationFrame(t => this.levelInterpolation(t, abort));
    }
  }

  private circleLayoutInterpolation(start: number, abort: AbortSignal) {
    if (abort.aborted) {
      return;
    }
    if (this.circleSpacingLerpTarget == 0) {
      this.circleSpacingLerpTarget = start + (this.circularLayout && this.circleLayoutActive ? 1 - this.circleLayoutLerp : this.circleLayoutLerp) * 1000;
    }
    const elapsed = Math.min(1000, 1000 - (this.circleSpacingLerpTarget - start)); // milliseconds
    if (this.circularLayout && this.circleLayoutActive) {
      this.circleLayoutLerp = elapsed / 1000;
    } else {
      this.circleLayoutLerp = 1 - elapsed / 1000;
    }
    if (this.graph != undefined) {
      this.render(this.graph, this.abortRender.signal, start);
    }
    if (elapsed < 1000) {
      requestAnimationFrame(s => this.circleLayoutInterpolation(s, abort));
    }
  }

  private centerCluster(node?: Node) {
    if (node != undefined) {
      this.circleLayoutCenter = node;
    }
    this.circleLayoutActive = node != undefined;
    this.circleSpacingLerpTarget = 0;
    requestAnimationFrame(t => this.circleLayoutInterpolation(t, this.abort.signal));
  }

  public ngOnDestroy() {
    this.app.destroy();
    this.abort.abort();
    this.abortRender.abort();
    this.abortLevel.abort();
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
      this.edgeGraphics2 = new PIXI.Graphics({ zIndex: 2000 });
      this.draggingEdge = new PIXI.Graphics();
      this.stage.addChild(this.edgeGraphics2);
      this.stage.addChild(this.draggingEdge);
      this.resize();
      this.init();
    })();
  }

  public ngOnChanges(changes: SimpleChanges) {
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

    if (changes["level"] && !changes["level"].isFirstChange()) {
      this.reset();
      if (this.graph != undefined) {
        this.createNodes(this.graph);
        this.render(this.graph, this.abortRender.signal);
      }
      if (this.level != 0) {
        this.abortLevel.abort();
        this.abortLevel = new AbortController();
        this.lastLevelTime = 0;
        requestAnimationFrame(t => this.levelInterpolation(t, this.abortLevel.signal));

        // CL
        const cluster = this.config.selectedCluster.value;
        if (cluster != undefined) {
          const node = this.config.configuration.value.definition.graph.nodeDictionary.get(cluster.id)!;
          const [n, l] = this.nodeDict.get(node)!;
          if (l == this.level) {
            this.centerCluster(node);
          }
        }
      }
    }

    if (changes["level"] && changes["level"].isFirstChange()) {
      this.currentLevel = this.level;
    }

    if (changes["circularLayout"] && !changes["circularLayout"].isFirstChange()) {
      // CL
      const cluster = this.config.selectedCluster.value;
      if (cluster != undefined) {
        const node = this.config.configuration.value.definition.graph.nodeDictionary.get(cluster.id)!;
        this.centerCluster(node);
      }
    }

    if (changes["nodeColor"] || changes["edgeColor"] || changes["nodeSize"] || changes["edgeRatio"] || changes["labels"]) {
      if (this.config.configuration.value.instance.graph.nodes.length > 0 && this.graph != undefined) {
        this.createNodes(this.graph);
        this.render(this.graph, this.abortRender.signal);
      }
    }

      // Convex hull when?

      // Prolblem that minimal differences are too large -> min prop dist for radius scale range

      // 1. Normal NL
      // 2. Aggregated levels
      // 3. Tree
      // 4. Minimap, ausblenden oder fade
      // 5. Circle packing / Hierarchical convex hulls
      // Idea: Animations to morph everything, even merging nodes to form clusters
      // Implementation: Lerp layoutPos to centroid pos or centroid to centroid or centroid to layout / layout target pos (circ pack) (how? -> don't, almost no benefit)
  }

  public resize(): void {
    this.width = this.container.nativeElement.offsetWidth;
    this.height = this.container.nativeElement.offsetHeight;
    this.app.renderer.resize(this.width * window.devicePixelRatio, this.height * window.devicePixelRatio);
    this.app.canvas.style!.width = `${this.width}px`;
    this.app.canvas.style!.height = `${this.height}px`;
    this.rect = (this.app.canvas as any).getBoundingClientRect();
  }

  public mouseMove(e: MouseEvent) {
    // Debounce on frame timestamp
    if (this.app == undefined || this.app.ticker == undefined || this.app.ticker.lastTime <= this.lastFrameTime) {
      return;
    }
    this.lastFrameTime = this.app.ticker.lastTime;
    if (this.isDraggingEdge) {
      const target = {
        x: e.clientX - this.rect.x,
        y: e.clientY - this.rect.y
      };
      [target.x, target.y] = this.transform.value.invert([target.x, target.y]);
      target.x *= window.devicePixelRatio;
      target.y *= window.devicePixelRatio;
      this.draggingEdge.clear();
      const black = { width: 3, color: "black" };
      const yellow = { width: 6, color: "yellow" };
      this.dashedLine(this.draggingEdge, this.draggingEdgeSourcePos, target, 24, 12);
      this.draggingEdge.stroke(yellow);
      this.dashedLine(this.draggingEdge, this.draggingEdgeSourcePos, target, 24, 12);
      this.draggingEdge.stroke(black);
    }
  }

  public zoom(transform: d3.ZoomTransform) { // pos + (offset * dpi / k) -> * k / dpi
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

  // Could allow color sections as argument
  private dashedLine(gfx: PIXI.Graphics, start: Point, target: Point, dash = 16, gap = 8, colors: [number, PIXI.StrokeInput][] = []) {
    const origin = start;
    const distance = Math.sqrt((start.x - target.x) ** 2 + (start.y - target.y) ** 2);
    let c = 0;
  
    for (let t = 0; t < distance; t += dash + gap) {
      gfx.moveTo(start.x, start.y);
      start = Utility.lerpP(origin, target, (t + dash) / distance);
      gfx.lineTo(start.x, start.y);
      start = Utility.lerpP(origin, target, (t + dash + gap) / distance);
      gfx.moveTo(start.x, start.y);

      if (colors.length > c) {
        const [s, stroke] = colors[c]
        const next = (t + dash + gap) / distance;
        if (next >= s || next >= 1) {
          gfx.stroke(stroke);
          c++;
        }
      }
    }
  }
}
