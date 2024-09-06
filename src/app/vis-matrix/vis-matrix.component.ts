import { Component, ElementRef, ViewChild } from '@angular/core';
import { ConfigurationService } from '../configuration.service';
import * as d3 from 'd3';
import { Cluster } from '../cluster';
import { AdjacencyList, Edge, Node } from '../graph';
import { Utility } from '../utility';
import { ClusterConnection, EmptyConnection } from '../cluster-connection';
import { MGGenerator } from '../generators';

interface MatrixCell {
  cx: Node,
  cy: Node,
  x: string,
  y: string,
  edge: Edge,
  highlight: boolean
}

@Component({
  selector: 'app-vis-matrix',
  standalone: true,
  imports: [],
  templateUrl: './vis-matrix.component.html',
  styleUrl: './vis-matrix.component.css'
})
export class VisMatrixComponent {


  // TODO:
  // - Selection modality (how to handle multiple?)
  // A) Single only
  // B) Disable directional properties (except for 1:N case) <- preferred
  // C) Directionality selection (complete matrix)
  
  // Show connection strength [min, max] color
  // Selection of arbitrary number of edges

  @ViewChild('svg')
  container!: ElementRef;

  xAxis!: d3.Selection<any, unknown, null, undefined>;
  yAxis!: d3.Selection<any, unknown, null, undefined>;
  svg!: d3.Selection<any, unknown, null, undefined>;
  rects!: d3.Selection<any, unknown, null, undefined>;
  dividersHorizontal!: d3.Selection<any, unknown, null, undefined>;
  dividersVertical!: d3.Selection<any, unknown, null, undefined>;
  borders!: d3.Selection<any, unknown, null, undefined>;

  xScale!: d3.ScaleBand<string>;
  yScale!: d3.ScaleBand<string>;

  initialized = false;

  // Margin and aspect ratio
  margin = { top: 10, right: 10, bottom: 80, left: 80 };
  width = 300 - this.margin.left - this.margin.right;
  height = 300 - this.margin.top - this.margin.bottom;

  constructor(private config: ConfigurationService) {
    config.configuration.subscribe(cfg => {
      // Render new graph
      this.render(this.config.configuration.value.definition.graph, this.config.level.value);
    });
    config.history.subscribe(cfg => {
      // Render if renamed
      if (cfg[cfg.length - 1].message.startsWith("Rename cluster")) {
        this.render(this.config.configuration.value.definition.graph, this.config.level.value);
      }
    });
    config.selectedConnections.subscribe(c => {
      // This also handles level change
      this.render(this.config.configuration.value.definition.graph, this.config.level.value);
    });
  }

  ngAfterViewInit(): void {
    this.xScale = d3.scaleBand().range([0, this.width]);
    this.yScale = d3.scaleBand().range([this.height, 0]);

    this.svg = d3.select(this.container.nativeElement)
      .attr("preserveAspectRatio", "xMinYMin meet")
      .attr("viewBox", `0 0 ${this.width + this.margin.left + this.margin.right} ${this.height + this.margin.top + this.margin.bottom}`)
      .style("font", "1rem verdana")
      .append("g")
      .attr("transform", `translate(${this.margin.left},${this.margin.top})`);
    
    this.rects = this.svg.append("g");
    this.dividersHorizontal = this.svg.append("g");
    this.dividersVertical = this.svg.append("g");
    this.borders = this.svg.append("g");

    this.xAxis = this.svg.append("g")
      .attr("transform", `translate(0, ${this.height})`)
      .call(d3.axisBottom(this.xScale));
  
    this.yAxis = this.svg.append("g")
      .call(d3.axisLeft(this.yScale));

    this.borders.append("line")
      .attr("x1", 0)
      .attr("x2", this.width)
      .attr("y1", this.height)
      .attr("y2", this.height)
      .style("stroke", "black")
      .style("stroke-width", 2);
  
    this.borders.append("line")
      .attr("x1", 0)
      .attr("x2", 0)
      .attr("y1", 0)
      .attr("y2", this.height)
      .style("stroke", "black")
      .style("stroke-width", 2);

    this.initialized = true;
    this.render(this.config.configuration.value.definition.graph, this.config.level.value);
  }

  render(graph: AdjacencyList, level: number) {
    if (!this.initialized) {
      return;
    }

    let nodes = graph.getNodes().filter(v => (v.data as Cluster).parent == -1);
    nodes = this.bfs(nodes.map(v => [v, 0]), level);

    // Two ordering schemes:
    // - by parent (no dividers, nothing is easy)
    // - by layer (dividers divide layers, easy navigation across layers)

    // Two selection schemes:
    // - full matrix with switch button
    // - no option, use groups for 1:N -> What if a new group does not fit into the current hierarchy?
    // - Redundancy with groups??

    // Further scenarios (no usecase)
    // - Multiple edges
    // - Cluster generators generate children

    // Subdivision does not make too much sense because it is hard to place labels on inner cells (quite important!)

    // Matrix cells
    const data: MatrixCell[] = [];
    for (let y = 0; y < nodes.length; y++) {
      for (let x = 0; x < nodes.length; x++) {
        const nodeX = nodes[x];
        const nodeY = nodes[y];
        const edges = graph.nodes.get(nodeX)!;
        const entry = edges.find(([e, v]) => v.id == nodeY.id); // This could be handled by service or tab-cluster-list
        let edge = entry != undefined ? entry[0] : undefined;

        if (edge == undefined) {
          edge = this.config.selectedConnections.value.find(e => e.source == nodeX && e.target == nodeY || e.source == nodeY && e.target == nodeX);
        }

        if (edge == undefined) {
          edge = { source: nodeX, target: nodeY, data: structuredClone(EmptyConnection) };
        }

        const cell: MatrixCell = {
          cx: nodeX,
          cy: nodeY,
          x: (nodeX.data as Cluster).name,
          y: (nodeY.data as Cluster).name,
          edge: edge,
          highlight: this.config.selectedConnections.value.find(e => e.source == nodeX && e.target == nodeY || e.source == nodeY && e.target == nodeX) != undefined
        };
        data.push(cell);
      }
    }

    this.xScale.domain(nodes.map(v => (v.data as Cluster).name));
    this.yScale.domain(nodes.map(v => (v.data as Cluster).name));

    let maxEdges = data.reduce((v, m) => Math.max(v, (m.edge.data as ClusterConnection)?.edgeCount), 0);
    maxEdges = Math.max(maxEdges, [...this.config.configuration.value.instance.clusterMeasures.values()].reduce((v, m) => Math.max(v, m.edgeCount), 0));
    const colorScale = d3.scaleSequential(d3.interpolateGreys).domain([0, maxEdges]);

    const color = (d: MatrixCell) => {
      const conn = d.edge.data as ClusterConnection;
      if (d.highlight) {
        return "orange";
      } else if (d.cx != d.cy) {
        return colorScale(conn.edgeCount);
      } else {
        return colorScale(this.config.configuration.value.instance.clusterMeasures.get(d.edge.source.id)!.edgeCount);
      }
    }

    const rects = this.rects.selectAll("rect")
      .data(data)
      .join("rect")
      .attr("x", d => this.xScale(d.x)! + 1)
      .attr("y", d => this.yScale(d.y)! + 1)
      .attr("width", this.xScale.bandwidth() - 2)
      .attr("height", this.yScale.bandwidth() - 2)
      .style("fill", d => color(d))
      // .attr("stroke", d => d.highlight ? "#ff6f00" : "transparent")
      .attr("stroke-width", 4)
      .on("click", (_, d) => {
        if (d.cx != d.cy) {
          // Add to selected

          // IDEA
          // - Selected connections only get added to the graph if #edges > 0
          // - This is handled by tab-connections
          // - Create missing connections in selection UI
          // - Create connections here always

          if (d.highlight) {
            this.config.selectedConnections.value.splice(this.config.selectedConnections.value.indexOf(d.edge), 1);
          } else {
            this.config.selectedConnections.value.push(d.edge);
          }
          this.config.selectedConnections.next(this.config.selectedConnections.value);
        }
      });

    this.dividersVertical.selectAll("line")
      .data(data)
      .join("line")
      .attr("x1", d => this.xScale(d.x)! + this.xScale.bandwidth())
      .attr("x2", d => this.xScale(d.x)! + this.xScale.bandwidth())
      .attr("y1", d => this.yScale(d.y)!)
      .attr("y2", d => this.yScale(d.y)! + this.yScale.bandwidth())
      .style("stroke", "black")
      .style("stroke-width", 2);

    this.dividersHorizontal.selectAll("line")
      .data(data)
      .join("line")
      .attr("x1", d => this.xScale(d.x)!)
      .attr("x2", d => this.xScale(d.x)! + this.xScale.bandwidth())
      .attr("y1", d => this.yScale(d.y)!)
      .attr("y2", d => this.yScale(d.y)!)
      .style("stroke", "black")
      .style("stroke-width", 2);
    
    // # Text inside cell

    // rects.selectAll("text")
    //   .data(data)
    //   .join("text")
    //   .attr("x", d => xScale(d.x)! + xScale.bandwidth() / 2)
    //   .attr("y", d => yScale(d.y)! + yScale.bandwidth() / 2 + 5)
    //   .attr("text-anchor", "middle")
    //   .text(d => d.c);
    

    this.xAxis.call(d3.axisBottom(this.xScale));
    this.yAxis.call(d3.axisLeft(this.yScale));

    this.xAxis.selectAll("text")  
      .style("text-anchor", "end")
      .attr("dx", "-.8em")
      .attr("dy", ".15em")
      .attr("transform", "rotate(-65)");

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

  private bfs(queue: [Node, number][], limit: number): Node[] {
    const output: Node[] = [];
    while (queue.length > 0) {
      const [currentNode, depth] = queue.shift()!;
      if (currentNode) {
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
}
