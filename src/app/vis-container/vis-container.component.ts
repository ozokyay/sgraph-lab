import { Component, ViewChild } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { VisMatrixComponent } from '../vis-matrix/vis-matrix.component';
import { VisNodeLink2Component } from '../vis-node-link-2/vis-node-link-2.component';
import { VisNodeLinkComponent } from '../vis-node-link/vis-node-link.component';

@Component({
  selector: 'app-vis-container',
  standalone: true,
  imports: [
    MatFormFieldModule,
    MatSelectModule,
    VisMatrixComponent,
    VisNodeLinkComponent,
    VisNodeLink2Component
  ],
  templateUrl: './vis-container.component.html',
  styleUrl: './vis-container.component.css'
})
export class VisContainerComponent {
  @ViewChild('matrix')
  private child1!: VisMatrixComponent;

  @ViewChild('nodeLink2')
  private child2!: VisNodeLink2Component;

  @ViewChild('nodeLink')
  private child3!: VisNodeLinkComponent;

  // Need switch event
  // 1. enable new vis, set new vis 0%
  // 2. start animation, start fade
  // 3. disable old vis

  // Layer scrolling?
  // Combobox only?

  // Idea:
  // 1. Level goes into vis container
  // 2. nls not combined (node level different from cluster hierarchy level)

  public resize() {
    this.child2?.resize();
    this.child3?.resize();
  }
}
