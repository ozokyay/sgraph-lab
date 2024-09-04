import { Component, AfterViewInit, OnChanges, ElementRef, Input, ViewChild, EventEmitter, Output, SimpleChanges } from '@angular/core';
import * as d3 from 'd3';
import { Point } from '../point';
import { Series } from '../series';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-vis-line-chart',
  standalone: true,
  imports: [
    MatInputModule,
    MatFormFieldModule,
    MatSlideToggleModule
  ],
  templateUrl: './vis-line-chart.component.html',
  styleUrl: './vis-line-chart.component.css'
})
export class VisLineChartComponent implements AfterViewInit, OnChanges {
  @Input()
  series!: Series;

  @Input()
  series2?: Series;

  @Output()
  seriesChange = new EventEmitter<Series>();

  @Input()
  allowAxisScaling = true;

  @Input()
  allowLogToggles = true;

  @Input()
  xLabel = "Node degree";

  @Input()
  yLabel = "Node count";

  @Input()
  yFormat?: string;

  @Input()
  editMode = true;

  @ViewChild('svg')
  container!: ElementRef;

  @ViewChild('controls')
  controls!: ElementRef;

  logarithmicX = false;
  logarithmicY = false;
  hovering = false;
  initialized = false;
  svg!: d3.Selection<any, unknown, null, undefined>;
  xScale!: any; // allow for linear and log scales
  yScale!: any;
  xAxis!: d3.Selection<any, unknown, null, undefined>;
  yAxis!: d3.Selection<any, unknown, null, undefined>;
  line!: d3.Selection<any, unknown, null, undefined>;
  line2!: d3.Selection<any, unknown, null, undefined>;
  handles!: d3.Selection<any, unknown, null, undefined>;

  // Margin and aspect ratio
  margin = { top: 30, right: 10, bottom: 50, left: 50 };
  width = 550 - this.margin.left - this.margin.right;
  height = 300 - this.margin.top - this.margin.bottom;

  rescaleCoordinatesX(e: any) {
    const dom = this.xScale.domain();
    const ran = this.xScale.range();
    if (e.checked) {
      this.xScale = d3.scaleLog()
    } else {
      this.xScale = d3.scaleLinear()
    }
    this.xScale.domain(dom).range(ran);
    this.xAxis.transition().call(d3.axisBottom(this.xScale));
    this.logarithmicX = e.checked;
    this.render(true);
  }

  rescaleCoordinatesY(e: any) {
    const dom = this.yScale.domain();
    const ran = this.yScale.range();
    if (e.checked) {
      this.yScale = d3.scaleSymlog()
    } else {
      this.yScale = d3.scaleLinear()
    }
    this.yScale.domain(dom).range(ran); // Prefer Symlog when new release with fixed ticks becomes available
    this.yAxis.transition().call(d3.axisLeft(this.yScale));
    this.logarithmicY = e.checked;
    this.render(true);
  }

  changeXAxis(e: any) {
    const [min, max] = this.series.xExtent;
    // for (const point of this.series.data) {
    //   point.x = (point.x - min) * ((+e.target.value - min) / (max - min)) + min;
    // }
    this.series.xExtent[1] = +e.target.value;
    let cutoff = -1;
    for (let i = 0; i < this.series.data.length; i++) {
      const point = this.series.data[i];
      if (point.x > this.series.xExtent[1]) {
        cutoff = i;
        break;
      }
    }
    if (cutoff > 0) {
      this.series.data.splice(cutoff, this.series.data.length - cutoff);
      if (this.series.data.length == 1) {
        this.series.data.push({ x: this.series.xExtent[1], y: 0 });
      }
    }
    this.render();
    this.seriesChange.emit(this.series);
  }

  changeYAxis(e: any) {
    for (const point of this.series.data) {
      point.y *= +e.target.value / this.series.yExtent[1];
    }
    this.series.yExtent[1] = +e.target.value;
    this.render();
    this.seriesChange.emit(this.series);
  }

  getPointerPos(point: number[]): Point {
    let x = point[0];
    let y = point[1];
    x = Math.min(this.width, Math.max(0, x));
    y = Math.min(this.height, Math.max(0, y));
    x = this.xScale.invert(x);
    y = this.yScale.invert(y);
    return { x: x, y: y };
  }

  // Unused
  findAtPos(pos: Point, r: number): number {
    let closestDistance = Number.MAX_VALUE;
    let closestIndex = -1;
    for (let i = 0; i < this.series.data.length; i++) {
      const point = this.series.data[i];
      const distance = Math.sqrt((point.x - pos.x) ** 2 + (point.y - pos.y) ** 2);
      if (distance < r && distance < closestDistance) {
        closestDistance = distance;
        closestIndex = i;
      }
    }
    return closestIndex;
  }

  dragStarted(e: any, d: any) { }

  dragMoved(e: any, d: any) {
    // const min = this.data![Math.max(0, d.i - 1)].x;
    // const max = this.data![Math.min(this.data!.length - 1, d.i + 1)].x;
    const pos = this.getPointerPos([e.x, e.y]);
    // pos.x = Math.min(max, Math.max(min, pos.x));
    // if (d.i == 0 || d.i == this.data!.length - 1) {
    //   pos.x = this.data![d.i].x;
    // }
    pos.x = this.series.data[d.i].x;
    this.series.data[d.i] = pos;
    this.render();
  }

  dragEnded(e: any, d: any) {
    this.seriesChange.emit(this.series);
  }

  ngOnChanges(changes: SimpleChanges) {
    let render = false;
    for (const change in changes)  {
      if (change == "series" && this.series != undefined) {
        render = true;
      } else if (change == "series2" && this.series2 != undefined) {
        render = true;
      }
    }
    if (render) {
      if (this.initialized) {
        this.render();
      } else {
        this.initialized = true;
      }
    }
  }

  ngAfterViewInit() {
    const container = d3.select(this.container.nativeElement)
      .style("margin-right", "20px")
      .attr("preserveAspectRatio", "xMinYMin meet")
      .attr("viewBox", `0 0 ${this.width + this.margin.left + this.margin.right} ${this.height + this.margin.top + this.margin.bottom}`)
      .on("contextmenu", e => {
        e.preventDefault();
      })
      .on("click", e => {
        // TODO: want to allow dragging right away
        // Maybe by moving on mousedown
        if (this.hovering || !this.editMode) {
          return;
        }
        let pointer = d3.pointer(e);
        pointer[0] -= this.margin.left;
        pointer[1] -= this.margin.top;
        const pos = this.getPointerPos(pointer);
        pos.x = Math.round(pos.x);
        const existing = this.series.data.find(p => p.x == pos.x);
        if (existing != undefined) {
          existing.y = pos.y;
        } else {
          this.series.data.push(pos);
          this.series.data.sort((a, b) => a.x - b.x);
        }
        this.render();
        this.seriesChange.emit(this.series);
      });

    this.svg = container
      .append("g")
      .attr("transform", `translate(${this.margin.left},${this.margin.top})`);

    this.xScale = d3.scaleLinear()
      .clamp(true)
      .domain([1, 10])
      .range([0, this.width]);

    this.yScale = d3.scaleLinear()
      .clamp(true)
      .domain([0, 100])
      .range([this.height, 0]);

    this.xAxis = this.svg.append("g")
      .attr("transform", `translate(0, ${this.height})`)
      .call(d3.axisBottom(this.xScale));

    this.yAxis = this.svg.append("g")
      .call(d3.axisLeft(this.yScale));

    this.svg.append("text")
      .attr("text-anchor", "middle")
      .attr("x", this.width / 2)
      .attr("y", this.height + this.margin.top + 10)
      .text(this.xLabel);

    this.svg.append("text")
      .attr("text-anchor", "middle")
      .attr("transform", "rotate(-90)")
      .attr("y", -this.margin.left + 15)
      .attr("x", -this.margin.top - this.height / 2 + 30)
      .text(this.yLabel)

    this.line2 = this.svg.append("g")
      .append("path");
    this.line = this.svg.append("g")
      .append("path");
    

    this.handles = this.svg.append("g");

    if (this.initialized) {
      this.render();
    }
    this.initialized = true;
  }

  render(useTransition: boolean = false) {
    if (this.series == undefined) {
      console.log("Linechart has no data");
      return;
    }

    this.xScale.domain(this.series.xExtent);
    this.yScale.domain(this.series.yExtent);
    this.xAxis.transition().call(d3.axisBottom(this.xScale));
    const axLeft = d3.axisLeft(this.yScale);
    if (this.yFormat != undefined) {
      axLeft.ticks(6, this.yFormat);
    }
    this.yAxis.transition().call(axLeft);

    const line = d3.line<Point>()
      .curve(d3.curveLinear)
      .x(d => this.xScale(d.x))
      .y(d => this.yScale(d.y));
    let dataLine: any = this.line.datum(this.series.data);
    if (useTransition) {
      dataLine = dataLine.transition();
    }
    dataLine.attr("class", "line")
      .attr("fill", "none")
      .attr("stroke", "steelblue")
      .attr("stroke-width", 2)
      .attr("d", line)
    
    if (this.series2 != undefined) {
      // let xScale2 = this.logarithmicX ? d3.scaleLog() : d3.scaleLinear();
      // let yScale2 = this.logarithmicY ? d3.scaleSymlog() : d3.scaleLinear() as any;
      // xScale2.domain(this.series2.xExtent).range(this.xScale.range());
      // yScale2.domain(this.series2.yExtent).range(this.yScale.range());
      const line2 = d3.line<Point>()
        .curve(d3.curveLinear)
        .x(d => this.xScale(d.x))
        .y(d => this.yScale(d.y));
      let dataLine2: any = this.line2.datum(this.series2.data);
      if (useTransition) {
        dataLine2 = dataLine2.transition();
      }
      dataLine2.attr("class", "line")
        .attr("fill", "none")
        .attr("stroke", "orange")
        .attr("stroke-width", 2)
        .attr("opacity", 0.6)
        .attr("d", line2)
    }
    
    if (!this.editMode) {
      this.handles.selectAll("circle")
        .remove();
      return;
    }

    const setHovering = (v: boolean) => {
      this.hovering = v;
    }

    const size = 4;
    let circles = this.handles.selectAll("circle")
      .data(this.series.data.map((v, i) => { return { d: v, i: i } }))
      .join("circle")
      .on("mouseover", function () {
        setHovering(true);
        d3.select(this).attr("fill", "gray");
      })
      .on("mouseleave", function () {
        setHovering(false);
        d3.select(this).attr("fill", "black");
      })
      .on("contextmenu", (e, d) => {
        e.preventDefault();
        if (d.i == 0 || d.i == this.series.data.length - 1) {
          return;
        }
        this.series.data.splice(d.i, 1);
        this.render();
        this.seriesChange.emit(this.series);
      })
      .call(d3.drag()
        .on("start", (e, d) => this.dragStarted(e, d))
        .on("drag", (e, d) => this.dragMoved(e, d))
        .on("end", (e, d) => this.dragEnded(e, d)) as any
      )
      .attr("r", size);
      //.attr("visibility", this.editing ? "visible" : "hidden");

    if (useTransition) {
      circles.transition()
        .attr("cx", d => this.xScale(d.d.x))
        .attr("cy", d => this.yScale(d.d.y))
    } else {
      circles
        .attr("cx", d => this.xScale(d.d.x))
        .attr("cy", d => this.yScale(d.d.y))
    }
  }
}
