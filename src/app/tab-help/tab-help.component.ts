import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';

@Component({
  selector: 'app-tab-help',
  standalone: true,
  imports: [
    MatButtonModule,
    MatDividerModule
  ],
  templateUrl: './tab-help.component.html',
  styleUrl: './tab-help.component.css'
})
export class TabHelpComponent {

}
