import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { VisLineChartComponent } from '../vis-line-chart/vis-line-chart.component';
import { FormsModule } from '@angular/forms';
import { GraphMeasures } from '../graph-configuration';
import { ConfigurationService } from '../configuration.service';
import { Node } from '../graph';
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
  public clusterNode?: Node = undefined;
  public cluster?: Cluster = undefined;

  constructor(private config: ConfigurationService) {
    config.measures.subscribe(measures => this.clusterMeasures = measures.clusterMeasures.get(this.cluster!));
    config.selectedCluster.subscribe(clusterNode => {
      this.clusterNode = clusterNode;
      this.cluster = clusterNode?.data as Cluster;
      this.clusterMeasures = config.measures.value.clusterMeasures.get(this.cluster);
    });
  }

  onChange() {
    if (this.cluster != undefined) {
      this.config.update("Change cluster " + this.clusterNode?.id);
    }
  }
}
