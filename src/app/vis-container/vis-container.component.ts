import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { VisMatrixComponent } from '../vis-matrix/vis-matrix.component';
import { VisNodeLink2Component } from '../vis-node-link-2/vis-node-link-2.component';
import { VisNodeLinkComponent } from '../vis-node-link/vis-node-link.component';
import { VisLevelComponent } from '../vis-level/vis-level.component';

@Component({
  selector: 'app-vis-container',
  standalone: true,
  imports: [
    MatFormFieldModule,
    MatSelectModule,
    VisMatrixComponent,
    VisNodeLinkComponent,
    VisNodeLink2Component,
    VisLevelComponent
  ],
  templateUrl: './vis-container.component.html',
  styleUrl: './vis-container.component.css'
})
export class VisContainerComponent {
  public level = 1;
  public nl1 = true;
  public nl2 = true;
  public combineClusters = true;

  @Input()
  public visualization: "matrix" | "node-link" = "matrix";

  @ViewChild('matrix')
  private child1!: VisMatrixComponent;

  @ViewChild('nodeLink2')
  private child2!: VisNodeLink2Component;

  @ViewChild('nodeLink')
  private child3!: VisNodeLinkComponent;

  @ViewChild('nodeLink2', { read: ElementRef })
  private ref2!: ElementRef;

  public changeLevel(level: number) {
    const previous = this.level;
    this.level = level;

    if (this.visualization == "matrix") {
      return;
    }
    
    if (level == 0) {
      // this.nl1 = true;
      // setTimeout(() => {
      //   this.nl2 = false;
      // }, 1000);
      this.combineClusters = false;
      console.log(this.ref2.nativeElement);
      this.ref2.nativeElement.classList.remove("fade-in");
      this.ref2.nativeElement.classList.add("fade-out");

      // 1. enable new vis, set new vis 0%
      // 2. start animation, start fade
      // 3. disable old vis
    } else if (previous == 0) {
      this.ref2.nativeElement.classList.remove("fade-out");
      this.ref2.nativeElement.classList.add("fade-in");
      // this.nl2 = true;
      // setTimeout(() => {
      //   this.nl1 = false;
      // }, 1000);
      this.combineClusters = true;
    }

    // Must sync transform between vis over container
    // Can use d3 for animation
  }

  public resize() {
    this.child1?.resize();
    this.child2?.resize();
    this.child3?.resize();
  }
}
