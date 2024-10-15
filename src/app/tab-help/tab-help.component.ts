import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { DialogData, DialogTutorialComponent } from '../dialog-tutorial/dialog-tutorial.component';
import { MatDialog } from '@angular/material/dialog';
import { TutorialService } from '../tutorial.service';

@Component({
  selector: 'app-tab-help',
  standalone: true,
  imports: [
    MatButtonModule,
    MatDividerModule,
    DialogTutorialComponent
  ],
  templateUrl: './tab-help.component.html',
  styleUrl: './tab-help.component.css'
})
export class TabHelpComponent {
  public step!: DialogData;
  readonly dialog = inject(MatDialog);

  constructor(private tutorial: TutorialService) {}

  public startTutorial() {
    // 0. Load example
    // 1. List (+btn)
    // 2. Tab-Cluster (left of tab start)
    // 3. MAT (right of tab start)
    // 4. NL2 lvl 1 (mid-left in tab)
    // 5. NL2 lvl 2 (mid-left in tab)
    // 5.1 Options (below options)
    // 6. NL1 (mid-left in tab)
    // 6.1 Options (below options)
    // 7. Tab-Layout (left of tab start)
    // 8. Tab-Connection (left of tab start)
    // 9. Measures (left of tab start)
    // 10. Diff-Sim (left of tab start)
    // 11. Import/Export (under last button)
    // 12. Tutorial done (center)

    // - Collect ElementRefs
    // - Write instructions
    // - Tab switches
    // - Select clusters/connections
    // - Diff sim
    // - Example graph

    const rect = this.tutorial.buttonAddCluster.getBoundingClientRect();
    const pos = {
      x: rect.left + 50,
      y: rect.top + 50
    };

    const dialogRef = this.dialog.open(DialogTutorialComponent, {
      data: { title: "Step 1", text: "This is the first step", position: pos },
    });

    dialogRef.afterClosed().subscribe(result => {
      console.log('The dialog was closed');
      // Next
    });
  }
}
