import { Component, Input, ViewChild, HostBinding, AfterViewInit, ElementRef } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggle, MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { VisMatrixComponent } from '../vis-matrix/vis-matrix.component';
import { VisNodeLink2Component } from '../vis-node-link-2/vis-node-link-2.component';
import { VisNodeLinkComponent } from '../vis-node-link/vis-node-link.component';
import { VisLevelComponent } from '../vis-level/vis-level.component';
import { trigger, state, style, animate, transition } from '@angular/animations';
import * as d3 from 'd3';
import { TutorialService } from '../tutorial.service';

@Component({
  selector: 'app-vis-container',
  standalone: true,
  imports: [
    MatFormFieldModule,
    MatSelectModule,
    VisMatrixComponent,
    VisNodeLinkComponent,
    VisNodeLink2Component,
    VisLevelComponent,
    MatButtonToggleModule,
    MatTooltipModule
  ],
  templateUrl: './vis-container.component.html',
  styleUrl: './vis-container.component.css',
  animations: [
    trigger('showHide', [
      state(
        'shown',
        style({
          opacity: 1,
        }),
      ),
      state(
        'hidden',
        style({
          opacity: 0,
        }),
      ),
      transition('shown <=> hidden', [animate('0.5s')]),
    ])
  ]
})
export class VisContainerComponent implements AfterViewInit {
  public level = 1;
  public nl1 = true;
  public nl2 = true;
  public combineClusters = true;
  public combineClustersImmediate = true;
  public transform = { value: new d3.ZoomTransform(1, 0, 0) };

  private zoom = d3.zoom();
  private width = 0;
  private height = 0;
  private timeout = -1;

  @Input()
  public visualization: "matrix" | "node-link" = "matrix";

  @Input()
  public initialZoom = 1;

  @ViewChild('matrix')
  private child1!: VisMatrixComponent;

  @ViewChild('nodeLink2')
  private child2!: VisNodeLink2Component;

  @ViewChild('nodeLink')
  private child3!: VisNodeLinkComponent;

  @ViewChild('container')
  private container!: ElementRef;

  @ViewChild('visLevel')
  private visLevel!: VisLevelComponent;

  @ViewChild('toggleCircular')
  public toggleCircular!: MatButtonToggle;

  @ViewChild('toggleNodeColor')
  public toggleNodeColor!: MatButtonToggle;

  @ViewChild('toggleEdgeColor')
  public toggleEdgeColor!: MatButtonToggle;

  constructor(public tutorial: TutorialService) {
    tutorial.start.subscribe(() => {
      this.transform = { value: new d3.ZoomTransform(1, 0, 0) };
      this.initZoom();
    });
    tutorial.update.subscribe(() => {
      this.visLevel.level = this.level;
      this.visLevel.levelText = this.level == 0 ? "N" : this.level.toString();
    });
  }
  
  ngAfterViewInit() {
    this.width = this.container.nativeElement.clientWidth;
    this.height = this.container.nativeElement.clientHeight;
    this.initZoom();
  }

  private initZoom() {
    this.zoom.filter((e: any) => (!e.ctrlKey || e.type === 'wheel') && !e.button && !e.shiftKey && !this.child2?.isDraggingEdge)
      .on("zoom", e => { this.transform = { value: e.transform } });
    d3.select(this.container.nativeElement)
      .call(this.zoom)
      .call(this.zoom.transform, d3.zoomIdentity.translate(this.width / 2, this.height / 2).scale(this.initialZoom));
  }

  public changeLevel(level: number) {
    this.level = level;

    if (this.visualization == "matrix") {
      return;
    }
    
    // Must apply level to nl1 after matrix

    if (level == 0) {
      this.nl1 = true;
      clearTimeout(this.timeout);
      this.timeout = setTimeout(() => {
        this.nl2 = false;
      }, 1000);
      setTimeout(() => {
        this.combineClusters = false;
      }, 150);
      this.combineClustersImmediate = false;
    } else {
      this.nl2 = true;
      clearTimeout(this.timeout);
      this.timeout = setTimeout(() => {
        this.nl1 = false;
      }, 1000);
      setTimeout(() => {
        this.combineClusters = true;
      }, 150);
      this.combineClustersImmediate = true;
    }
  }

  public resize() {
    this.child1?.resize();
    this.child2?.resize();
    this.child3?.resize();
    this.width = this.container.nativeElement.clientWidth;
    this.height = this.container.nativeElement.clientHeight;
  }

  public mouseMove(e: MouseEvent) {
    this.child2?.mouseMove(e);
  }
}
