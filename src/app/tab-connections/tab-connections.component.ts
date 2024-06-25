import { Component } from '@angular/core';
import { ClusterConnection } from '../cluster-connection';
import { ConfigurationService } from '../configuration.service';
import { MatButtonModule } from '@angular/material/button';
import { MatSliderModule } from '@angular/material/slider';

@Component({
  selector: 'app-tab-connections',
  standalone: true,
  imports: [
    MatButtonModule,
    MatSliderModule
  ],
  templateUrl: './tab-connections.component.html',
  styleUrl: './tab-connections.component.css'
})
export class TabConnectionsComponent {
  public connections?: ClusterConnection[] = undefined;
  public multiEditing: boolean = false;

  // Maybe UI strings for source/target labels

  constructor(private config: ConfigurationService) {

  }

  public onReset() {

  }

  // How to implement multi-editing?
  // - Work on array of selected connections
  // - Requirement of common source
}
