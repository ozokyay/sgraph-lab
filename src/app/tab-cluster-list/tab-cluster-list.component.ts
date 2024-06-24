import { Component } from '@angular/core';
import { ConfigurationService } from '../configuration.service';
import { Series } from '../series';
import { Cluster } from '../cluster';
import * as d3 from 'd3';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { NgClass, NgFor } from '@angular/common';
import { Node } from '../graph';

@Component({
  selector: 'app-tab-cluster-list',
  standalone: true,
  imports: [
    MatListModule,
    MatButtonModule,
    MatIconModule,
    NgClass,
    NgFor
  ],
  templateUrl: './tab-cluster-list.component.html',
  styleUrl: './tab-cluster-list.component.css'
})
export class TabClusterListComponent {

  public clusters: Node[] = [];
  public selectedCluster?: Node = undefined;

  private colors: number[] = [];

  constructor(private config: ConfigurationService) {
    config.configuration.subscribe(config => this.clusters = config.defintion.graph.getNodes());
    config.selectedCluster.subscribe(cluster => this.selectedCluster = cluster);
  }

  public getColor(cluster: Node) {
    return d3.schemeCategory10[cluster.data.color % 10];
  }

  public onAddCluster() {
    // use colors like ids, but reorder to quickly find next
    const colors = [...this.colors]
    colors.sort();
    let col = 0;
    for (const color of colors) {
      if (color == col) {
        col++;
      } else {
        break;
      }
    }
    this.colors.push(col);

    const clusters = this.config.configuration.value.defintion.graph.getNodes();
    const id = clusters.length > 0 ? clusters[clusters.length - 1].id + 1 : 0;
    const series: Series = {
      data: [
        { x: 1, y: 50 },
        { x: 2, y: 35 },
        { x: 3, y: 25 },
        { x: 4, y: 15 },
        { x: 5, y: 10 },
        { x: 6, y: 5 },
        { x: 7, y: 3 },
        { x: 8, y: 2 },
        { x: 9, y: 1 },
        { x: 10, y: 0 },
      ],
      xExtent: [1, 10],
      yExtent: [0, 50]
    }

    const data: Cluster = { generator: "CL", color: col, degreeDistribution: series, extractGiantComponent: true }
    const cluster: Node = { id: id, data: data };
    this.config.configuration.value.defintion.graph.addNode(cluster);
    this.config.selectedCluster.next(cluster);
    this.config.update("Add cluster " + id);
  }

  public onRemoveCluster(event: MouseEvent, cluster: Node) {
    event.stopPropagation();
    if (cluster === this.selectedCluster) {
      this.config.selectedCluster.next(undefined);
    }
    const nodes = this.config.configuration.value.defintion.graph.getNodes();
    const index = nodes.indexOf(cluster);
    this.colors.splice(index, 1);
    this.config.configuration.value.defintion.graph.removeNode(cluster);
    this.config.update("Remove cluster " + cluster.id);
  }

  public onSelectCluster(cluster: Node) {
    this.config.selectedCluster.next(cluster);
  }
}
