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
import { CLGenerator, CMGenerator, MGGenerator } from '../generators';
import { DegreesDefault, Series } from '../series';

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
  public generator?: any = undefined; // To erase type for html

  constructor(private config: ConfigurationService) {
    config.measures.subscribe(measures => {
      if (this.cluster != undefined) {
        this.clusterMeasures = measures.clusterMeasures.get(this.cluster!.id)
      }
    });
    config.configuration.subscribe(config => {
      if (this.cluster != undefined) {
        this.clusterMeasures = config.instance.clusterMeasures.get(this.cluster!.id)
      }
    });
    config.selectedCluster.subscribe(cluster => {
      this.cluster = cluster;
      if (this.cluster != undefined) {
        this.generator = this.cluster.generator;
        this.clusterMeasures = config.measures.value.clusterMeasures.get(this.cluster.id);
        console.log(this.cluster);
      }
    });
  }

  public onChangeGenerator(generator: string) {
    const oldGenerator = this.cluster!.generator as any;
    let degreeDistribution: Series = oldGenerator.degreeDistribution || DegreesDefault;
    let extractGiantComponent: boolean = oldGenerator.extractGiantComponent || true;
    switch (generator) {
      case "CL":
        this.cluster!.generator = new CLGenerator(degreeDistribution, extractGiantComponent);
        break;
      case "CM":
        this.cluster!.generator = new CMGenerator(degreeDistribution, extractGiantComponent);
        break;
      case "MG":
        this.cluster!.generator = new MGGenerator();
        break;
    }
    this.generator = this.cluster!.generator;
    this.onChange();
  }

  public onChange() {
    if (this.cluster != undefined) {
      this.cluster.changeUUID = crypto.randomUUID();
      this.config.update("Change cluster " + this.cluster.id);
    }
  }

  public onChangeName() {
    if (this.cluster != undefined) {
      this.config.trackHistory("Rename cluster " + this.cluster.id);
    }
  }
}
