import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, Input, OnChanges, SimpleChanges } from '@angular/core';
import { ConfigurationService } from '../configuration.service';
import { Edge, EdgeData, EdgeList, Node, NodeData } from '../graph';
import * as PIXI from 'pixi.js';
import * as d3 from 'd3';
import { Utility } from '../utility';
import Rand from 'rand-seed';
import { Cluster } from '../cluster';
import { Point } from '../point';
import { ClusterConnection } from '../cluster-connection';
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
  private edgeWidthScale!: d3.ScaleLinear<number, number, never>;
  private selectedNode?: Node = undefined;
  private circleSpacingCenter?: Node = undefined;
  private circleSpacingLerp: number = 0;
  private circleSpacingLerpTarget: number = 0;
  private lastRenderTime: number = 0;

  private currentLevel = 1;
  private speed = 1 / 500;
  private lastLevelTime = 0;

  @Input()
  public transform = { value: new d3.ZoomTransform(1, 0, 0) };

  @Input()
  public level: number = 1;

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
      this.reset();
      this.graph = this.prepare(new EdgeList(config.definition.graph));
    }));
    this.subscriptions.push(this.config.centroids.subscribe(() => {
      if (this.graph != undefined && this.graph.nodes.length > 0) {
        this.reset();
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
    //    - highlight in NL
    //    - stronger highlight in list?
    //    - Adv NL vs mat: understanding edits (smooth anim vs reorder)
    this.subscriptions.push(this.config.selectedCluster.subscribe(c => {
      // Change circleSpacing atom sim stuff
      const highlight = false;
      if (c != undefined && highlight) {
        // This is for allowing node selection from list
      }
    }));
    this.subscriptions.push(this.config.activeTab.subscribe(t => {
      if (t != 1) {
        this.selectedNode = undefined;
      }
    }));
  }

  private reset() {
    this.abort.abort();
    this.abort = new AbortController();
    this.circleSpacingLerp = 0;
    this.selectedNode = undefined;
    this.circleSpacingCenter = undefined;
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


    // Step 1: Node + edge scaling (OK)
    // Step 2.1: Lerp to level
    // Step 2.2: Lerp to minimap
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
      const radius = this.config.graphicsSettings.value.nodeRadius ? this.radiusScale(measures.get(node.id)!.nodeCount) : (this.nodeRadiusRange[0] + this.nodeRadiusRange[1]) / 2;
      gfx.circle(0, 0, radius);

      // Alpha: This node has selected incident edges
      // const anySelection = this.config.selectedConnections.value.length > 0;
      // const alpha = !anySelection || selectedEdges.find(e => e.source == node || e.target == node) ? 1 : 0.2;
      const alpha = 1;

      gfx.stroke({ width: 3, color: 'black', alpha: alpha });
      gfx.fill({ color: this.getNodeColor(node, true), alpha: alpha }); // Ignore graphics settings for readability
      gfx.interactive = true;
      gfx.onmouseenter = () => {
        gfx.tint = 0x9A9A9A;
      };
      gfx.onmouseleave = () => {
        gfx.tint = 0xFFFFFF;
      }
      gfx.onclick = () => {

        // Tab to connections
        // TODO: wildcard connection 1:N on first select (not intuitive to start with, so different var in service to store which view has focus (or undefined))
        // TODO: Also allow selection without circular?

        if (this.selectedNode == undefined) {
          this.selectedNode = node;
          this.circleSpacingCenter = node;
        } else {
          this.selectedNode = undefined;
        }

        this.circleSpacingLerpTarget = 0;
        requestAnimationFrame(t => this.circleSpacingInterpolation(t, this.abort.signal));


        // Arrange others around this
        // - set selected clusters != undefined
        // - start lerp to circular, translate stage to put selection in view center, fade irrelevant edges, show potential (dashed) edges
        // - stroke orange (symbolize outgoing)

        // To fit with matrix (never no connections selected): Starting connections wildcard?
        // Right-click on other = center that one

        // Scaling:
        // - problem with shells: inaccurate additional variable (perceived distance)
        // - just scale up radius
        // - keep siblings close together? -> determined by underlying layout, easy

        // Graphics setting to disable circular layout
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

    // Apply graphics settings
    const settings = this.config.graphicsSettings.value;

    const upper = Math.ceil(this.currentLevel);
    const lower = Math.floor(this.currentLevel);
    
    // Level positions
    // Calculate COM
    let centerOfMass: Point = { x: 0, y: 0 };
    let comCount = 0;
    let centerPos: Point = { x: 0, y: 0 };
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

      if (level == this.level || (level <= this.level && cluster.children.length == 0)) {
        if (node != this.circleSpacingCenter) {
          centerOfMass = Utility.addP(centerOfMass, gfx.position);
          comCount++;
        } else {
          centerPos = gfx.position;
        }
      }
    }
    centerOfMass = Utility.scalarMultiplyP(1 / comCount, centerOfMass);
    centerOfMass = Utility.subtractP(centerOfMass, centerPos);
    // centerOfMass = Utility.normalizeP(centerOfMass);
    const comAngle = Math.atan2(centerOfMass.y, centerOfMass.x); // This is used to start placing around
    const angles: [PIXI.Graphics, number][] = [];
    let startAngle = comAngle;

    if (graph.nodes.length > 1 && this.circleSpacingCenter != undefined) {
      for (const node of graph.nodes) {
        if (node == this.circleSpacingCenter) {
          continue;
        }
  
        const [gfx, level] = this.nodeDict.get(node)!;
        if (level != this.level && (node.data as Cluster).children.length > 0 || level > this.level) {
          continue;
        }
        const gfxVec = Utility.subtractP(gfx.position, centerPos);
        const angle = -Math.atan2(gfxVec.x * centerOfMass.y - gfxVec.y * centerOfMass.x, gfxVec.x * centerOfMass.x + gfxVec.y * centerOfMass.y); // This is the angle to the com
        angles.push([gfx, angle]);
      }
      angles.sort((a, b) => a[1] - b[1]);
    }
    if (angles.length > 1 && this.circleSpacingCenter != undefined) {
      // const rightIndex = angles.findIndex(v => v[1] >= comAngle);
      const middle = angles.findIndex(v => v[1] >= 0);
      
      // const left = angles[Utility.mod(leftIndex, angles.length)];
      // const right = angles[Utility.mod(leftIndex + 1, angles.length)];
      // const middle = Utility.scalarMultiplyP(0.5, Utility.addP(left[0].position, right[0].position));
      // startAngle = Math.atan2(middle.y - centerPos.y, middle.x - centerPos.x) + Math.PI;

      // Circle lerp
      for (let i = 0; i < angles.length; i++) { // angles
        const [gfx, angle] = angles[i];
        // const radius = this.radiusScale(this.config.configuration.value.instance.clusterMeasures.get(node.id)!.nodeCount);
        // const [gfx, level] = this.nodeDict.get(node)!;

        const minRadius = 1000; // increase until no overlap at max spread
        const spread = 1;

        const step = 2 * Math.PI / angles.length * spread;
        let maxAngle = startAngle + 0.5 * step + (i - middle) * step;
        maxAngle = Utility.mod(maxAngle, 2 * Math.PI);

        // default positions
        let circlePos = this.circlePosition(startAngle + angle, minRadius);
        circlePos = Utility.addP(centerPos, circlePos);

        // max positions
        let maxCirclePos = this.circlePosition(maxAngle, minRadius);
        maxCirclePos = Utility.addP(centerPos, maxCirclePos);

        // 1. OK calc center of mass of angles from base pos of others
        // 2. OK Calculate default positions on circle: vectors or angles
        // 3. OK Calculate max space positions on circle (sort by angles rel to center (offset), find two closest to com (angle dist, scalar product), spread)
        // 4. OK Sort by angles, assign to slots clockwise
        // 5. WORSE THAN FD Test min overlap free t up to 1

        gfx.position = Utility.lerpP(gfx.position, maxCirclePos, this.circleSpacingLerp);
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
      const sourceRadius = this.radiusScale(this.config.configuration.value.instance.clusterMeasures.get(edge.source.id)!.nodeCount);
      const targetRadius = this.radiusScale(this.config.configuration.value.instance.clusterMeasures.get(edge.target.id)!.nodeCount);

      const sourcePos = Utility.addP(sourceGraphics.position, Utility.scalarMultiplyP(sourceRadius, Utility.normalizeP(Utility.subtractP(targetGraphics.position, sourceGraphics.position))));
      const targetPos = Utility.addP(targetGraphics.position, Utility.scalarMultiplyP(targetRadius, Utility.normalizeP(Utility.subtractP(sourceGraphics.position, targetGraphics.position))));

      // 1. OK auto tab switch on selection (deselect on switch back)
      // 2. OK highlight edges on tab select
      // 3. OK highlight community in list and disable controls on tab select
      // 4. community select and center lerp on node click, deselect on other views, highlight cluster on hover, zIndex (matrix + nl2 + nl1), select from cluster list because why not (which minimap of multiple? center)
      // 4.0 encode stuff in edges
      // 4.1 Scaling (nuclear model)
      // 4.2 multi level (circle packing, pinning)
      // 5. overlap handling
      // 6. dashed lines
      // 7. second cluster selection
      // 8. cross-layer support (circle packing inside or outside, selection)
      // 9. wildcard selection in matrix and nl2
      // 10. better inf diff
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
      // const alpha = !anySelection || selectedEdges.indexOf(edge) != -1 ? 1 : 0.2;
      const alpha = Math.min(sourceGraphics.alpha, targetGraphics.alpha);

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

  private levelInterpolation(time: number) {
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
      this.render(this.graph, this.abort.signal, time);
    }
    if (this.currentLevel != this.level) {
      requestAnimationFrame(t => this.levelInterpolation(t));
    }
  }

  private circleSpacingInterpolation(start: number, abort: AbortSignal) {
    if (abort.aborted) {
      return;
    }
    if (this.circleSpacingLerpTarget == 0) {
      this.circleSpacingLerpTarget = start + (this.selectedNode ? 1 - this.circleSpacingLerp : this.circleSpacingLerp) * 1000;
    }
    const elapsed = Math.min(1000, 1000 - (this.circleSpacingLerpTarget - start)); // milliseconds
    if (this.selectedNode) {
      this.circleSpacingLerp = elapsed / 1000;
    } else {
      this.circleSpacingLerp = 1 - elapsed / 1000;
    }
    if (this.graph != undefined) {
      this.render(this.graph, this.abort.signal, start);
    }
    if (elapsed < 1000) {
      requestAnimationFrame(s => this.circleSpacingInterpolation(s, abort));
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

  public ngOnChanges(changes: SimpleChanges) {
    if (changes["transform"]) {
      if (this.stage != undefined) {
        this.zoom(this.transform.value);
      }
    }

    if (changes["level"] && !changes["level"].isFirstChange()) {
      this.reset();
      if (this.level != 0) {
        this.lastLevelTime = 0;
        requestAnimationFrame(t => this.levelInterpolation(t));
      }
    }


      // Convex hull when?

      // Minimap
      // - Specialized for 1:N
      // - Non-overlapping

      // Prolblem that minimal differences are too large -> min prop dist for radius scale range

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
}
