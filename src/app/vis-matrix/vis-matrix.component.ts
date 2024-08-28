import { Component, ElementRef, ViewChild } from '@angular/core';
import { ConfigurationService } from '../configuration.service';
import * as d3 from 'd3';
import { Cluster } from '../cluster';
import { AdjacencyList, Edge, Node } from '../graph';

interface MatrixCell {
  cx: Node,
  cy: Node,
  x: string,
  y: string,
  link?: Edge,
  highlighted: boolean
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
  // - Level UI
  // - Get definiton nodes for current level
  // - Selection modality (how to handle multiple?)
  
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
      this.render(cfg.definition.graph);
    });
    config.history.subscribe(cfg => {
      // Render if renamed
      if (cfg[cfg.length - 1].message.startsWith("Rename cluster")) {
        this.render(this.config.configuration.value.definition.graph);
      }
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
    this.render(this.config.configuration.value.definition.graph);
  }

  render(graph: AdjacencyList) {
    if (!this.initialized) {
      return;
    }

    const nodes = graph.getNodes();

    // Matrix cells
    const data: MatrixCell[] = [];
    for (let y = 0; y < nodes.length; y++) {
      for (let x = 0; x < y + 1; x++) {
        const nodeX = nodes[x];
        const nodeY = nodes[y];
        const edges = graph.nodes.get(nodeX)!;
        const edge = edges.find(([e, v]) => v.id == nodeY.id);

        const cell: MatrixCell = {
          cx: nodeX,
          cy: nodeY,
          x: (nodeX.data as Cluster).name,
          y: (nodeY.data as Cluster).name,
          link: edge ? edge[0] : undefined,
          highlighted: false
        };
        data.push(cell);
      }
    }

    this.xScale.domain(nodes.map(v => (v.data as Cluster).name));
    this.yScale.domain(nodes.map(v => (v.data as Cluster).name).reverse());
    // const otherExtent = d3.extent(data.filter(d => d.x != d.y).map(d => d.link.edgeCount)) as [number, number];
    const otherScale = d3.scaleSequential(d3.interpolateBlues).domain([0, 1]);
    const selfScale = d3.scaleSequential(d3.interpolateBlues).domain([0, 1]);

    const color = (d: MatrixCell) => {
      return selfScale(0);
      if (d.x == d.y) {
        // return selfScale(d.link.edgeCount);
      } else {
        // return otherScale(d.link.edgeCount); // TODO: Ideally also want relative density here [0, 1]
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
      .attr("stroke", d => d.highlighted ? "#ff6f00" : "transparent")
      .attr("stroke-width", 4)
      .on("click", (_, d) => {
        if (d.cx != d.cy) {
          // Add to selected
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
}
