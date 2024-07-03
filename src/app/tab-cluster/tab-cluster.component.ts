import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { VisLineChartComponent } from '../vis-line-chart/vis-line-chart.component';
import { FormsModule } from '@angular/forms';
import { GraphMeasures } from '../graph-configuration';
import { ConfigurationService } from '../configuration.service';
import { Cluster } from '../cluster';

@Component({
  selector: 'app-tab-cluster',
  standalone: true,
  imports: [
    MatInputModule,
    MatFormFieldModule,
    MatSlideToggleModule,
    MatSelectModule,
    VisLineChartComponent,
    FormsModule
  ],
  templateUrl: './tab-cluster.component.html',
  styleUrl: './tab-cluster.component.css'
})
export class TabClusterComponent {

  public clusterMeasures?: GraphMeasures;
  public cluster?: Cluster = undefined;

  constructor(private config: ConfigurationService) {
    config.measures.subscribe(measures => this.clusterMeasures = measures.clusterMeasures.get(this.cluster!));
    config.selectedCluster.subscribe(cluster => {
      this.cluster = cluster;
      if (this.cluster == undefined) {
        return;
      }
      this.clusterMeasures = config.measures.value.clusterMeasures.get(this.cluster);
    });
  }

  onChange() {
    if (this.cluster != undefined) {
      this.config.update("Change cluster " + this.cluster.id);
    }
  }

  onChangeName() {
    if (this.cluster != undefined) {
      this.config.trackHistory("Rename cluster " + this.cluster.id);
    }
  }
}
