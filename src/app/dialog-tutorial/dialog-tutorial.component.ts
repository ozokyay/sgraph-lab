import { Component, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogConfig, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Point } from 'pixi.js';

export interface DialogData {
  title: string,
  text: string,
  position: Point
}

@Component({
  selector: 'app-dialog-tutorial',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule
  ],
  templateUrl: './dialog-tutorial.component.html',
  styleUrl: './dialog-tutorial.component.css'
})
export class DialogTutorialComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<DialogTutorialComponent>);
  readonly data = inject<DialogData>(MAT_DIALOG_DATA);

  constructor(private matDialogRef: MatDialogRef<DialogTutorialComponent>) {}

  public ngOnInit() {
    if (this.data.position.x != -1 && this.data.position.y != -1) {
      this.matDialogRef.updatePosition({
        left: `${this.data.position.x}px`,
        top: `${this.data.position.y}px`
      });
    }
    this.matDialogRef.disableClose = true;
  }

  public close() {
    this.dialogRef.close();
  }
}
