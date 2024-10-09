import { AfterViewInit, Component, ElementRef, HostListener, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { ConfigurationService } from '../configuration.service';
import * as d3 from 'd3';
import { Cluster } from '../cluster';
import { AdjacencyList, Edge, Node } from '../graph';
import { Utility } from '../utility';
import { ClusterConnection, EmptyConnection } from '../cluster-connection';
import { MGGenerator } from '../generators';
import { Subscription } from 'rxjs';

interface MatrixCell {
  cx: Node,
  cy: Node,
  x: string,
  y: string,
  edge?: Edge,
  highlight: boolean,
  dividerX: boolean,
  dividerX2: boolean,
  dividerY: boolean,
  dividerY2: boolean
}

@Component({
  selector: 'app-vis-matrix',
  standalone: true,
  imports: [],
  templateUrl: './vis-matrix.component.html',
  styleUrl: './vis-matrix.component.css'
})
export class VisMatrixComponent implements AfterViewInit, OnChanges, OnDestroy {


  // TODO:
  // - Selection modality (how to handle multiple?)
  // A) Single only
  // B) Disable directional properties (except for 1:N case) <- preferred
  // C) Directionality selection (complete matrix)
  
  // Show connection strength [min, max] color
  // Selection of arbitrary number of edges

  @Input()
  level: number = 1;

  @ViewChild('svg')
  container!: ElementRef;

  xAxis!: d3.Selection<any, unknown, null, undefined>;
  yAxis!: d3.Selection<any, unknown, null, undefined>;
  legAxis!: d3.Selection<any, unknown, null, undefined>;
  svg!: d3.Selection<any, unknown, null, undefined>;
  svgRoot!: d3.Selection<any, unknown, null, undefined>;
  rects!: d3.Selection<any, unknown, null, undefined>;
  dividersHorizontal!: d3.Selection<any, unknown, null, undefined>;
  dividersHorizontal2!: d3.Selection<any, unknown, null, undefined>;
  dividersVertical!: d3.Selection<any, unknown, null, undefined>;
  dividersVertical2!: d3.Selection<any, unknown, null, undefined>;
  legend!: d3.Selection<any, unknown, null, undefined>;
  legendRect!: d3.Selection<any, unknown, null, undefined>; 

  xScale!: d3.ScaleBand<string>;
  yScale!: d3.ScaleBand<string>;
  legScale!: d3.ScaleLogarithmic<number, number>;

  private subscriptions: Subscription[] = [];

  // Margin and aspect ratio
  margin = { top: 10, right: 10, bottom: 80, left: 80 };
  width = 300 - this.margin.left - this.margin.right;
  height = 340 - this.margin.top - this.margin.bottom;
  legendHeight = 40;
  scale = 1;

  debounceResize = false;

  constructor(private config: ConfigurationService) {}

  private init() {
    this.subscriptions.push(this.config.configuration.subscribe(cfg => {
      // Render new graph
      this.render(this.config.configuration.value.definition.graph, this.level);
    }));
    this.subscriptions.push(this.config.history.subscribe(cfg => {
      // Render if renamed
      if (cfg[cfg.length - 1].message.startsWith("Rename cluster")) {
        this.render(this.config.configuration.value.definition.graph, this.level);
      }
    }));
    this.subscriptions.push(this.config.selectedConnections.subscribe(c => {
      // Redundant with level change, but level change can only be propagated after this
      this.render(this.config.configuration.value.definition.graph, this.level);
    }));
  }

  public ngAfterViewInit(): void {
    this.svgRoot = d3.select(this.container.nativeElement)
      .attr("preserveAspectRatio", "xMinYMin meet")
      // .attr("viewBox", `0 0 ${this.width + this.margin.left + this.margin.right} ${this.height + this.margin.top + this.margin.bottom}`)
      .style("font", "1rem verdana")
      .style("width", "100%")
      .style("height", "100%");

    this.svg = this.svgRoot.append("g")
      .attr("transform", `translate(${this.margin.left},${this.margin.top})`);


    this.xScale = d3.scaleBand();
    this.yScale = d3.scaleBand();
    this.rects = this.svg.append("g");
    this.dividersHorizontal = this.svg.append("g");
    this.dividersVertical = this.svg.append("g");
    this.dividersHorizontal2 = this.svg.append("g");
    this.dividersVertical2 = this.svg.append("g");

    this.xAxis = this.svg.append("g")
      .call(d3.axisBottom(this.xScale));

    this.yAxis = this.svg.append("g")
      .call(d3.axisLeft(this.yScale));
    
    const domain = d3.range(0, 1, 0.1);
    const color = d3.scaleSequential(d3.interpolateGreys).domain([0, 1]);

    this.svg.append("defs")
      .append("linearGradient")
      .attr("id", "linear-gradient")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "100%")
      .attr("y2", "0%")
      .selectAll("stop")
      .data(domain)
      .enter()
      .append("stop")
      .attr("offset", d => d)
      .attr("stop-color", d => color(d));
    
    this.legend = this.svg.append("g");
    this.legendRect = this.legend.append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("height", 20)
      .style("fill", "url(#linear-gradient)");
    
    this.legScale = d3.scaleLog()
      .domain([1, 100]);
    this.legAxis = this.legend.append("g")
      .attr("transform", `translate(0, 20)`) 
      .call(d3.axisBottom(this.legScale));

    this.legend.append("text")
      .text("Edge count:")
      .attr("transform", `translate(-75, 15)`)
      .style("font", "0.65rem verdana");

    this.setSize();
    this.init();
  }

  public ngOnChanges(changes: SimpleChanges) {
    if (changes["level"] && !changes["level"].isFirstChange()) {
      this.render(this.config.configuration.value.definition.graph, this.level);
    }
  }

  public ngOnDestroy() {
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    this.subscriptions = [];
  }

  render(graph: AdjacencyList, level: number) {
    const levels: number[] = [];
    let nodes = graph.getNodes().filter(v => (v.data as Cluster).parent == -1);
    nodes = this.bfs(nodes.map(v => [v, 0]), level, levels);

    // Matrix cells
    const data: MatrixCell[] = [];
    for (let y = 0; y < nodes.length; y++) {
      for (let x = 0; x < nodes.length; x++) {
        const nodeX = nodes[x];
        const nodeY = nodes[y];
        const cell: MatrixCell = {
          cx: nodeX,
          cy: nodeY,
          x: (nodeX.data as Cluster).name,
          y: (nodeY.data as Cluster).name,
          highlight: this.config.selectedConnections.value.find(e => e.source == nodeX && e.target == nodeY || e.source == nodeY && e.target == nodeX) != undefined,
          dividerX: levels.indexOf(y + 1) != -1 && x <= y,
          dividerY: levels.indexOf(x + 1) != -1 && y <= x,
          dividerX2: levels.indexOf(y) != -1 && x <= y - 1,
          dividerY2: levels.indexOf(x) != -1 && y <= x - 1
        };
        data.push(cell);
      }
    }

    // Edge assignment
    const allEdges: Edge[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const nodeX = nodes[i];
      const edges = graph.nodes.get(nodes[i])!;
      for (let j = 0; j < i; j++) {
        const nodeY = nodes[j];
        // Check graph
        const entry = edges.find(([e, v]) => v.id == nodeY.id); // This could be handled by service or tab-cluster-list
        let edge = entry != undefined ? entry[0] : undefined;

        // Check selected
        if (edge == undefined) {
          edge = this.config.selectedConnections.value.find(e => e.source == nodeX && e.target == nodeY || e.source == nodeY && e.target == nodeX);
        }

        // Create
        if (edge == undefined) {
          edge = { source: nodeX, target: nodeY, data: structuredClone(EmptyConnection) };
        }

        data[i * nodes.length + j].edge = edge;
        data[j * nodes.length + i].edge = edge;
        allEdges.push(edge);
      }

      data[i * nodes.length + i].edge = { source: nodeX, target: nodeX, data: structuredClone(EmptyConnection) };
    }

    this.xScale.domain(nodes.map(v => (v.data as Cluster).name));
    this.yScale.domain(nodes.map(v => (v.data as Cluster).name));

    let maxEdges = data.reduce((v, m) => Math.max(v, (m.edge!.data as ClusterConnection)?.edgeCount), 0);
    maxEdges = Math.max(maxEdges, [...this.config.configuration.value.instance.clusterMeasures.values()].reduce((v, m) => Math.max(v, m.edgeCount), 0));
    const logScale = d3.scaleLog().domain([1, maxEdges + 1]).range([0, 1]);
    const colorScale = d3.scaleSequential(d3.interpolateGreys).domain([0, 1]);

    const color = (d: MatrixCell) => {
      const conn = d.edge!.data as ClusterConnection;
      if (d.highlight) {
        // Color alternatives
        // -> circle
        // -> arrow
        // -> gradient
        // -> inlayed border

        // Alpha according to scale?
        if (d.cx == d.edge!.source) {
          return "orange";
        } else {
          return "blue";
        }
      } else if (d.cx != d.cy) {
        return colorScale(logScale(conn.edgeCount + 1));
      } else {
        return colorScale(logScale(this.config.configuration.value.instance.clusterMeasures.get(d.edge!.source.id)!.edgeCount + 1));
      }
    }

    const dividerSpace = this.scale;

    const rects = this.rects.selectAll("rect")
      .data(data)
      .join("rect")
      .attr("x", d => this.xScale(d.x)! + (d.dividerY2 ? dividerSpace : 0))
      .attr("y", d => this.yScale(d.y)! + (d.dividerX ? dividerSpace : 0))
      .attr("width", d => this.xScale.bandwidth() - (d.dividerY ? dividerSpace : 0) - (d.dividerY2 ? dividerSpace : 0))
      .attr("height", d => this.yScale.bandwidth() - (d.dividerX ? dividerSpace : 0) - (d.dividerX2 ? dividerSpace : 0))
      .style("fill", d => color(d))
      // .attr("stroke", d => d.highlight ? "#ff6f00" : "transparent")
      .attr("stroke-width", 4)
      .on("click", (_, d) => {
        if (d.cx != d.cy) {
          // 1:1
          if (d.highlight) {
            this.config.selectedConnections.value.splice(this.config.selectedConnections.value.indexOf(d.edge!), 1);
          } else {
            if (d.cx != d.edge!.source) {
              [d.edge!.source, d.edge!.target] = [d.edge?.target!, d.edge!.source];
            }
            this.config.selectedConnections.value.push(d.edge!);
          }
          this.config.selectedConnections.next(this.config.selectedConnections.value);
        } else {
          // 1:N
          // Get respective edges
          const selection = (this.config.selectedConnections.value
            .map((e, i) => [e, i]) as [Edge, number][])
            .filter(([e, i]) => e.source == d.cx || e.target == d.cx);

          // Get selected connections on current level
          const levelSelection = selection.filter(([e, i]) => nodes.indexOf(e.source) != -1 && nodes.indexOf(e.target) != -1);

          // Same behavior as 1:1 but broadcast to 1:N

          // Also want missing - single pass?
          if (levelSelection.length == nodes.length - 1) {
            for (const [e, i] of levelSelection.reverse()) {
              this.config.selectedConnections.value.splice(i, 1);
            }
          } else {
            // Add missing
            // Search through all real edges
            for (const edge of allEdges) {
              if ((edge.source == d.cx || edge.target == d.cx) && selection.find(([e, i]) => e == edge) == undefined) {
                if (d.cx != edge.source) {
                  [edge.source, edge.target] = [edge.target, edge.source];
                }
                this.config.selectedConnections.value.push(edge);
              }
            }
          }
          this.config.selectedConnections.next(this.config.selectedConnections.value);
        }
      })
      .on("contextmenu", (e, d) => {
        e.preventDefault();
        if (d.cx == d.cy) {
          return;
        }
        if (d.highlight) {
          [d.edge!.source, d.edge!.target] = [d.edge?.target!, d.edge!.source];
          this.config.selectedConnections.next(this.config.selectedConnections.value);
        }
      });

    this.dividersVertical.selectAll("line")
      .data(data)
      .join("line")
      .attr("x1", d => this.xScale(d.x)! + this.xScale.bandwidth() - (d.dividerY ? dividerSpace : 0))
      .attr("x2", d => this.xScale(d.x)! + this.xScale.bandwidth() - (d.dividerY ? dividerSpace : 0))
      .attr("y1", d => this.yScale(d.y)! + (d.dividerY && d.dividerX ? dividerSpace / 2 : 0))
      .attr("y2", d => this.yScale(d.y)! + this.yScale.bandwidth())
      .style("stroke", "black")
      .style("stroke-width", 1);

    this.dividersVertical2.selectAll("line")
      .data(data)
      .join("line")
      .attr("x1", d => this.xScale(d.x)! + this.xScale.bandwidth() + dividerSpace)
      .attr("x2", d => this.xScale(d.x)! + this.xScale.bandwidth() + dividerSpace)
      .attr("y1", d => this.yScale(d.y)!)
      .attr("y2", d => this.yScale(d.y)! + this.yScale.bandwidth())
      .attr("visibility", d => d.dividerY ? "visible" : "hidden")
      .style("stroke", "black")
      .style("stroke-width", d => 1);

    this.dividersHorizontal.selectAll("line")
      .data(data)
      .join("line")
      .attr("x1", d => this.xScale(d.x)!)
      .attr("x2", d => this.xScale(d.x)! + this.xScale.bandwidth())
      .attr("y1", d => this.yScale(d.y)! - (d.dividerX ? dividerSpace : 0))
      .attr("y2", d => this.yScale(d.y)! - (d.dividerX ? dividerSpace : 0))
      .style("stroke", "black")
      .style("stroke-width", 1);
    
    this.dividersHorizontal2.selectAll("line")
      .data(data)
      .join("line")
      .attr("x1", d => this.xScale(d.x)!)
      .attr("x2", d => this.xScale(d.x)! + this.xScale.bandwidth() - (d.dividerY ? dividerSpace : 0))
      .attr("y1", d => this.yScale(d.y)! + dividerSpace)
      .attr("y2", d => this.yScale(d.y)! + dividerSpace)
      .attr("visibility", d => d.dividerX ? "visible" : "hidden")
      .style("stroke", "black")
      .style("stroke-width", 1);
    
    // # Text inside cell

    // rects.selectAll("text")
    //   .data(data)
    //   .join("text")
    //   .attr("x", d => xScale(d.x)! + xScale.bandwidth() / 2)
    //   .attr("y", d => yScale(d.y)! + yScale.bandwidth() / 2 + 5)
    //   .attr("text-anchor", "middle")
    //   .text(d => d.c);
    

    this.xAxis.call(d3.axisBottom(this.xScale).tickSizeOuter(0));
    this.yAxis.call(d3.axisLeft(this.yScale).tickSizeOuter(0));

    const label = (d: Node): string => {
      const conn = this.config.selectedConnections.value.find(e => e.source == d || e.target == d);
      if (conn == undefined) {
        return "normal";
      } else {
        return "bold";
      }
    };

    const scalingFactor = Math.min(1, 17 / nodes.length * this.scale);

    this.xAxis.selectAll("text")
      .data(nodes)
      .style("text-anchor", "end")
      .attr("transform", `translate(${scalingFactor * -4 - 9}, ${10}) rotate(-65)`)
      .attr("font-weight", d => label(d))
      .attr("font-size", `${scalingFactor}em`);
    
    this.yAxis.selectAll("text")
      .data(nodes)
      .style("text-anchor", "end")
      .attr("x", -15)
      .attr("font-weight", d => label(d))
      .attr("font-size", `${scalingFactor}em`);

    this.xAxis.selectAll("g")
      .data(nodes)
      .join("g")
      .append("rect")
      .attr("width", scalingFactor * 3)
      .attr("height", scalingFactor * 10)
      .attr("fill", d => (d.data as Cluster).color)
      .attr("transform", `translate(${scalingFactor * -6},${10}) rotate(-65)`);

    this.yAxis.selectAll("g")
      .data(nodes)
      .join("g")
      .append("rect")
      .attr("x", -12)
      .attr("y", scalingFactor * -6)
      .attr("width", scalingFactor * 3)
      .attr("height", scalingFactor * 10)
      .attr("fill", d => (d.data as Cluster).color);

    this.legScale.domain([1, maxEdges]);
    this.legAxis.call(d3.axisBottom(this.legScale).ticks(6));

    // # Circles around axis ticks

    // this.xAxis.selectAll("g")
    //   .selectAll("text")
    //   .attr("y", 12.5);

    // this.xAxis.selectAll("g")
    //   .append("circle")
    //   .lower()
    //   .attr("r", 8)
    //   .attr("cy", 16)
    //   .attr("fill", "lightgray")
    //   .on("click", (e, d) => {console.log(d);});

    // this.yAxis.selectAll("g")
    //   .selectAll("text")
    //   .attr("x", -16)
    //   .style("text-anchor", "middle");

    // this.yAxis.selectAll("g")
    //   .append("circle")
    //   .lower()
    //   .attr("r", 8)
    //   .attr("cx", -16)
    //   .attr("cy", -0.5)
    //   .attr("fill", "lightgray");
  }

  private bfs(queue: [Node, number][], limit: number, levels: number[] = []): Node[] {
    const depthLevels: number[] = [];
    const output: Node[] = [];
    while (queue.length > 0) {
      const [currentNode, depth] = queue.shift()!;
      if (currentNode) {
        if (depthLevels.length == 0 && depth > 0 || depth > depthLevels[depthLevels.length - 1]) {
          depthLevels.push(depth);
          levels.push(output.length);
        }
        output.push(currentNode);
        const cluster = currentNode.data as Cluster;
        if (depth >= limit - 1) {
          continue;
        }
        for (const c of cluster.children) {
          const child = this.config.configuration.value.definition.graph.nodeDictionary.get(c)!;
          queue.push([child, depth + 1]);
        }
      }
    }
    return output;
  }

  private setSize() {
    const actualWidth = this.container.nativeElement.clientWidth;
    const actualHeight = this.container.nativeElement.clientHeight;
    const size = Math.min(actualWidth, actualHeight) * 0.5;
    this.width = size;
    this.height = size + this.legendHeight;
    this.scale = size / 300;
    this.svgRoot.attr("viewBox", `0 0 ${this.width + this.margin.left + this.margin.right} ${this.height + this.margin.top + this.margin.bottom}`);
    this.xScale.range([0, this.width]);
    this.yScale.range([this.height - this.legendHeight - this.margin.top, 0]);
    this.xAxis.attr("transform", `translate(0, ${this.height - this.legendHeight - this.margin.top})`);
    this.legend.attr("transform", `translate(0, ${this.height + this.margin.bottom - this.margin.top - this.legendHeight})`);
    this.legendRect.attr("width", this.width + 1);
    this.legScale.range([0, this.width])
  }

  public resize() {
    if (this.debounceResize) {
      return;
    }
    this.debounceResize = true;
    setTimeout(() => {
      this.debounceResize = false;
    }, 1000);
    this.setSize();
    this.render(this.config.configuration.value.definition.graph, this.level);    
  }
}
