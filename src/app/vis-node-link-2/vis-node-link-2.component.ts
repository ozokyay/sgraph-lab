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
import { combineLatestInit } from 'rxjs/internal/observable/combineLatest';

@Component({
  selector: 'app-vis-node-link-2',
  standalone: true,
  imports: [],
  templateUrl: './vis-node-link-2.component.html',
  styleUrl: './vis-node-link-2.component.css'
})
export class VisNodeLink2Component implements AfterViewInit, OnChanges, OnDestroy {

  private edgeScale = 500;
  private nodeRadius = 3;
  private nodeRadiusRange = [50, 150];
  private edgeWidthRange = [5, 25]

  private app!: PIXI.Application;
  private stage!: PIXI.Container;
  private rect!: DOMRect;
  private width: number = 0;
  private height: number = 0;
  private nodeDict: Map<Node, [PIXI.Graphics, number]> = new Map();
  private edgeGraphics!: PIXI.Graphics;
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

  private currentLevel = 1;
  private speed = 1 / 500;
  private lastLevelTime = 0;

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
      // if (t != 1) {
      //   this.reset();
      // }
    }));
    this.subscriptions.push(this.config.selectedCluster.subscribe(c => {
      if (this.graph != undefined) {
        if (this.circularLayout) {
          if (c != undefined) {
            const node = this.config.configuration.value.definition.graph.nodeDictionary.get(c.id)!;
            const [_, level] = this.nodeDict.get(node)!
            if (level == this.level) {
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
  }

  private reset() {
    this.abort.abort(); // Actually useless
    this.abort = new AbortController();
    this.circleLayoutLerp = 0;
    this.circleLayoutCenter = undefined;
  }

  private prepare(graph: EdgeList): EdgeList {
    // Add other levels somewhere else (max dist from others)?
    // Or minimap + circle packing??
    // Or just be limited not working across levels
    // How about allowing top-down (but not bottom-up)?

    // TODO: Also 
    // Can also start from 
    // Specialized in 1:N editing and READING (common after adding new cluster)
    // MUST differentiate between generated edges and connections (care more about the latter because of editing)


    // Step 1: Node + edge scaling (OK)
    // Step 2.1: Lerp to level (OK)
    // Step 2.2: Lerp to minimap (OK)
    // Step 3: Minimap scaling
    // Step 4: Multilevel support

    // Need all nodes and edges here, lerp position and alpha in render()

    graph.nodes = graph.nodes.filter(n => (n.data as Cluster).generator.name != "MG");
    graph.edges = graph.edges.filter(e => (e.source.data as Cluster).generator.name != "MG" && (e.target.data as Cluster).generator.name != "MG")
    this.createNodes(graph);

    return graph;
  }

  private createNodes(graph: EdgeList) {
    for (const [gfx, _] of this.nodeDict.values()) {
      // this.stage.removeChild(gfx);
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
      const gfx = new PIXI.Graphics();
      const radius = this.nodeSize ? this.radiusScale(measures.get(node.id)!.nodeCount) : (this.nodeRadiusRange[0] + this.nodeRadiusRange[1]) / 2;
      const alpha = 1;

      gfx.clear();
      gfx.circle(0, 0, radius);
      if (this.config.selectedCluster.value != undefined && node.id == this.config.selectedCluster.value.id && level <= this.level) {
        gfx.stroke({ width: 40, color: 0x222222, alpha: alpha });
      } else {
        gfx.stroke({ width: 3, color: 'black', alpha: alpha });
      }
      gfx.fill({ color: this.getNodeColor(node, true), alpha: alpha }); // Ignore graphics settings for readability
      gfx.interactive = true;
      gfx.onmouseenter = () => {
        gfx.tint = 0x9A9A9A;
      };
      gfx.onmouseleave = () => {
        gfx.tint = 0xFFFFFF;
      }
      gfx.onclick = () => {
        // Select cluster
        const cluster = node.data as Cluster;
        if (this.config.selectedCluster.value == cluster) {
          this.config.selectedCluster.next(undefined);
        } else {
          this.config.selectedCluster.next(cluster);
        }
      };
      gfx.onrightclick = () => {
        // Select: How to choose blue vs orange? Left-right click, modifier to center? Only allow to select two? Allow to select many? Drag-to-select?
        // Selection modality: Highlight edges? (from matrix)?

        // TODO
        // - Always render selected edge
        // - 1:N (double click?)
        // - Highlight selected edges
        // - Highlight selected cluster (list/nl1/nl2)
        // - matrix/nl clear button (in tab?)
        // - Lerp transform to center center
        // - Edge directedness, don't highlight selection in orange because canbe wrong from matrix
        // - Potential edges from lower layer to upper leaf missing, circular not running for leaves on their level
        // - Right click on list (optional)
        // - Edge directenedess (orange/blue ends)
        // - Maybe don't draw dashed for all in circle (clutter)

        // Select cluster for edit
        const selectedCluster = this.config.selectedCluster.value;
        if (selectedCluster == undefined) {
          return;
        }
        const selectedNode = this.config.configuration.value.definition.graph.nodeDictionary.get(selectedCluster.id)!;
        if (selectedNode == node) {
          return;
        }

        // Deselect
        const selectedEdge = this.config.selectedConnections.value.find(e => e.source == selectedNode && e.target == node || e.source == node && e.target == selectedNode);
        if (selectedEdge != undefined) {
          this.config.selectedConnections.value.splice(this.config.selectedConnections.value.indexOf(selectedEdge), 1);
          this.config.selectedConnections.next(this.config.selectedConnections.value);
          return;
        }

        // Select
        if (node != selectedNode) {
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
            [edge.source, edge.target] = [edge.target, edge.source];
          }
          this.config.selectedConnections.value.push(edge);
          this.config.selectedConnections.next(this.config.selectedConnections.value);
        }
      };
      this.nodeDict.set(node, [gfx, level]);
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

    this.zoom(this.transform.value);

    const upper = Math.ceil(this.currentLevel);
    const lower = Math.floor(this.currentLevel);

    // Level positions
    for (const node of graph.nodes) {
      const cluster = node.data as Cluster;
      const [gfx, level] = this.nodeDict.get(node)!;
      gfx.zIndex = 1000 - level;
      gfx.position = this.calculateBasePos(node, level, upper, lower);

      // Opacity
      if (cluster.children.length > 0) {
        if (level == upper) {
          gfx.alpha = this.currentLevel == upper ? 1 : this.currentLevel - lower;
        } else if (level == lower) {
          gfx.alpha = this.currentLevel == lower ? 1 : upper - this.currentLevel;
        } else {
          gfx.alpha = 0;
        }
      }

      // Overlap prevention
      // -> Why not multilevel layout in the first place
      // -> Lerp all the way
      // -> Use tl positions as starting points instead of random
      // -> Also in service, basically iterative ForceDirected()

      // -> Easier: Force sim on current level without edges until overlap free
    }

    // Circular
    if (this.circleLayoutCenter != undefined) {
      let centerPos = this.nodeDict.get(this.circleLayoutCenter)![0].position;
      const anglesList: [PIXI.Graphics, number, number][] = [];

      if (graph.nodes.length > 1) {
        for (const node of graph.nodes) {
          if (node == this.circleLayoutCenter) {
            continue;
          }
    
          const [gfx, level] = this.nodeDict.get(node)!;
          if (level != this.level && (node.data as Cluster).children.length > 0 || level > this.level) {
            continue;
          }
          const gfxVec = Utility.subtractP(gfx.position, centerPos);
          // Get angle on unit circle
          const alpha = Math.atan2(gfxVec.y, gfxVec.x) + Math.PI;
          anglesList.push([gfx, alpha, 0]);
        }
      }

      const mod = (a: number, n: number) => a - Math.floor(a / n) * n;
      const dist = (a: number, b: number) => {
        const abs = Math.abs(a - b);
        if (abs > Math.PI)
          return Math.min(a, b) - (Math.max(a, b) - 2 * Math.PI);
        else
          return abs;
      };
  
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
            const min = 0.3
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
              a[2] += Math.min(1 / d, 0.1) * direction; // Maybe want 1 / (100 * d)
              b[2] += Math.min(1 / d, 0.1) * -direction;
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
      } while (moved && it < 100);
      // console.log("it" + it);

      // Circle lerp
      for (const [gfx, angle, _] of anglesList) {
        const circlePos = Utility.addP(centerPos, this.circlePosition(angle - Math.PI, 1000))
        gfx.position = Utility.lerpP(gfx.position, circlePos, this.circleLayoutLerp);
      }
    }

    for (const node of graph.nodes) {
      const cluster = node.data as Cluster;
      const [gfx, level] = this.nodeDict.get(node)!;
      if (level > this.level && this.currentLevel == this.level && cluster.parent != -1) {
        const [pgfx, plevel] = this.nodeDict.get(this.config.configuration.value.definition.graph.nodeDictionary.get(cluster.parent)!)!
        gfx.position = pgfx.position;
      }
    }

    // Render edges
    this.edgeGraphics?.clear();
    for (const edge of graph.edges) {
      const data = edge.data as ClusterConnection;
      const source = edge.source.data as Cluster;
      const target = edge.target.data as Cluster;

      const [sourceGraphics, sourceLevel] = this.nodeDict.get(edge.source)!;
      const [targetGraphics, targetLevel] = this.nodeDict.get(edge.target)!;

      if (data.edgeCount == 0 || Math.abs(sourceLevel - this.level) >= 1 || Math.abs(targetLevel - this.level) >= 1) {
        return;
      }

      // Radius could be saved somewhere
      const midRadius = (this.nodeRadiusRange[0] + this.nodeRadiusRange[1]) / 2;
      const sourceRadius = this.nodeSize ? this.radiusScale(this.config.configuration.value.instance.clusterMeasures.get(edge.source.id)!.nodeCount) : midRadius;
      const targetRadius = this.nodeSize ? this.radiusScale(this.config.configuration.value.instance.clusterMeasures.get(edge.target.id)!.nodeCount) : midRadius;

      const sourcePos = Utility.addP(sourceGraphics.position, Utility.scalarMultiplyP(sourceRadius, Utility.normalizeP(Utility.subtractP(targetGraphics.position, sourceGraphics.position))));
      const targetPos = Utility.addP(targetGraphics.position, Utility.scalarMultiplyP(targetRadius, Utility.normalizeP(Utility.subtractP(sourceGraphics.position, targetGraphics.position))));

      // 1. OK auto tab switch on selection (deselect on switch back)
      // 2. OK highlight edges on tab select
      // 3. OK highlight community in list and disable controls on tab select
      // 4. deselect on click again, highlight cluster on hover, zIndex (matrix + nl2 + nl1)
      // 4.0 encode stuff in edges
      // 4.1 Scaling (nuclear model)
      // 4.2 multi level (circle packing, pinning)
      // 5. overlap handling
      // 6. dashed lines
      // 7. keybinds
      // 8. labels
      // 9. wildcard selection in matrix and nl2
      // 10. better inf diff, better connections tab, better tabs
      // 11. tables
      // 12. attributes
      // 13. data recording
      // 14. walkthrough
      // 15. tasks
      // 16. Labels in vis and hover for attributes

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

      // List can only do 1:N
      // Priority: synchronize matrix and nl/minimap

      // -> N:M and different directions
      // -> select first and second node OR select actual edge
      // -> both can have problems with overlap, can ignore for now

      // Idea: Cluster list click can do 1:N
      // Idea: Cluster list highlights selected connections with some highlight color (ignore directions because cannot show all from matrix)
      // Idea: Selecting in one vis deselects in all others, implemented as focus bool

      // Edge width better scale, node radius better scale (do not exaggerate miniscule differences, start medium)

      // Next feature: Cluster selection & sync with list highlight -> depending on active tab (or even in active tab)
      // Follow-up: Second cluster or edge selection

      // Then: Attributes, Tables, Walkthrough

      // Transparency of unselected if there is an active selection
      
      // Keep selected, fade out unselected from active selection
      let alpha;
      if (source == this.circleLayoutCenter?.data || target == this.circleLayoutCenter?.data) {
        alpha = 1;
      } else {
        alpha = Utility.lerp(Math.min(sourceGraphics.alpha, targetGraphics.alpha), 0, this.circleLayoutLerp);
      }

      const middle = {
        x: (sourcePos.x + targetPos.x) / 2,
        y: (sourcePos.y + targetPos.y) / 2
      };
      this.edgeGraphics.moveTo(sourcePos.x, sourcePos.y);
      this.edgeGraphics.lineTo(middle.x, middle.y);
      // this.getNodeColor(edge.source, settings.edgeColoring)
      this.edgeGraphics.stroke({ width: this.edgeWidthScale(data.edgeCount), color: "black", alpha: alpha });
      this.edgeGraphics.moveTo(middle.x, middle.y);
      this.edgeGraphics.lineTo(targetPos.x, targetPos.y);
      this.edgeGraphics.stroke({ width: this.edgeWidthScale(data.edgeCount), color: "black", alpha: alpha });
    }

    // Potential edges circular layout
    if (this.circleLayoutCenter != undefined) {
      const [centerGfx, _] = this.nodeDict.get(this.circleLayoutCenter)!;
      for (const node of graph.nodes) {
        if (node == this.circleLayoutCenter) {
          continue;
        }
        const [gfx, level] = this.nodeDict.get(node)!;
        if (level != this.level) {
          continue;
        }
        this.dashedLine(this.edgeGraphics, centerGfx.position, gfx.position, 24, 12);
        this.edgeGraphics.stroke({ width: 4, color: "black", alpha: this.circleLayoutLerp });
      }
    }

    // Potential edges or highlight edge selection
    for (const edge of this.config.selectedConnections.value) {
      const [sourceGfx, sourceLevel] = this.nodeDict.get(edge.source)!;
      const [targetGfx, targetLevel] = this.nodeDict.get(edge.target)!;
      if (sourceLevel != this.level || targetLevel != this.level) {
        continue;
      }
      this.dashedLine(this.edgeGraphics, sourceGfx.position, targetGfx.position, 24, 12);
      this.edgeGraphics.stroke({ width: 4, color: "black" });
    }
  }

  private calculateBasePos(node: Node, level: number, upper: number, lower: number) {
    const pos = this.config.centroids.value.get(node.id)!;
    let result: Point = {
      x: pos.x * this.edgeScale,
      y: pos.y * this.edgeScale
    };

    const cluster = node.data as Cluster;
    if (level > 1) {
      const parent = cluster.parent;
      const parentPos = this.config.centroids.value.get(parent)!;
      const scaledParentPos = {
        x: parentPos.x * this.edgeScale,
        y: parentPos.y * this.edgeScale
      }
      let lerp: number;
      if (level == upper) {
        lerp = this.currentLevel == upper ? 1 : this.currentLevel - lower;
      } else if (level == lower) {
        lerp = this.currentLevel == lower ? 1 : upper - this.currentLevel;
      } else {
        lerp = 0;
      }
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
      this.edgeGraphics = new PIXI.Graphics();
      this.stage.addChild(this.edgeGraphics);
      this.resize();
      this.init();
    })();
  }

  public ngOnChanges(changes: SimpleChanges) {
    if (changes["transform"]) {
      if (this.stage != undefined) {
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

    if (changes["circularLayout"] && !changes["circularLayout"].isFirstChange()) {
      // CL
      const cluster = this.config.selectedCluster.value;
      if (cluster != undefined) {
        const node = this.config.configuration.value.definition.graph.nodeDictionary.get(cluster.id)!;
        this.centerCluster(node);
      }
    }

    if (changes["nodeColor"] || changes["edgeColor"] || changes["nodeSize"]) {
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

  public zoom(transform: d3.ZoomTransform) {
    this.stage.scale = { x: transform.k, y: transform.k };
    this.stage.pivot = { x: -transform.x / transform.k * devicePixelRatio, y: -transform.y / transform.k * devicePixelRatio };
  }

  // Could allow color sections as argument
  private dashedLine(gfx: PIXI.Graphics, start: Point, target: Point, dash = 16, gap = 8) {
    const origin = start;
    const distance = Math.sqrt((start.x - target.x) ** 2 + (start.y - target.y) ** 2);
  
    for (let t = 0; t < distance; t += dash + gap) {
      gfx.moveTo(start.x, start.y);
      start = Utility.lerpP(origin, target, (t + dash) / distance);
      gfx.lineTo(start.x, start.y);
      start = Utility.lerpP(origin, target, (t + dash + gap) / distance);
      gfx.moveTo(start.x, start.y);
    }
  }
}
