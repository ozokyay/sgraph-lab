import { Component } from '@angular/core';
import { ConfigurationService } from '../configuration.service';
import { GraphMeasures } from '../graph-configuration';
import { Cluster } from '../cluster';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { VisLineChartComponent } from '../vis-line-chart/vis-line-chart.component';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-tab-statistics',
  standalone: true,
  imports: [
    MatSlideToggleModule,
    VisLineChartComponent,
    FormsModule
  ],
  templateUrl: './tab-statistics.component.html',
  styleUrl: './tab-statistics.component.css'
})
export class TabStatisticsComponent {
  public statistics?: GraphMeasures = undefined;
  public global: boolean = false;

  private selectedCluster?: Cluster = undefined;

  constructor(private config: ConfigurationService) {
    config.selectedCluster.subscribe(cluster => {
      this.selectedCluster = cluster;
      this.setStatistics();
    });
    config.measures.subscribe(measures => {
      this.setStatistics();
    });
  }

  public setStatistics() {
    if (this.global) {
      this.statistics = this.config.measures.value.globalMeasures;
    } else if (this.selectedCluster != undefined) {
      this.statistics = this.config.measures.value.clusterMeasures.get(this.selectedCluster.id);
    } else {
      this.statistics = undefined;
    }
  }
}
