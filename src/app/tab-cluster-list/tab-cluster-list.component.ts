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

  public clusters: Cluster[] = [];
  public selectedCluster?: Cluster = undefined;

  constructor(private config: ConfigurationService) {
    config.configuration.subscribe(configuration => this.clusters = configuration.definition.graph.getNodes().map(n => n.data as Cluster));
    config.selectedCluster.subscribe(cluster => this.selectedCluster = cluster);
  }

  public getColor(cluster: Cluster) {
    return d3.schemeCategory10[cluster.color % 10];
  }

  public onAddCluster() {
    // Use colors like ids, but reorder to quickly find next
    const colors = [...this.clusters.map(c => c.color)]
    colors.sort();
    let col: number = 0;
    for (const c of colors) {
      if (c == col) {
        col++;
      } else {
        break;
      }
    }

    const id = this.clusters.length > 0 ? this.clusters[this.clusters.length - 1].id + 1 : 0;
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

    const cluster: Cluster = { id: id,
      generator: "CL",
      color: col,
      degreeDistribution: series,
      extractGiantComponent: true,
      name: "Cluster " + this.numberToLetters(id + 1)
    };
    const node: Node = { id: id, data: cluster };
    this.config.configuration.value.definition.graph.addNode(node);
    this.config.selectedCluster.next(cluster);
    this.config.update("Add cluster " + id);
  }

  public onRemoveCluster(event: MouseEvent, cluster: Cluster) {
    event.stopPropagation();
    if (cluster == this.selectedCluster) {
      this.config.selectedCluster.next(undefined);
    }
    const node = this.config.configuration.value.definition.graph.nodeDictionary.get(cluster.id)!;
    this.config.configuration.value.definition.graph.removeNode(node);
    this.config.update("Remove cluster " + node.id);
  }

  public onSelectCluster(cluster: Cluster) {
    this.config.selectedCluster.next(cluster);
  }

  private numberToLetters(value: number): string {
    let letters: string = "";
    while (value > 0) {
        const modulo: number = (value - 1) % 26;
        letters = String.fromCharCode(65 + modulo) + letters;
        value = Math.floor((value - modulo) / 26);
    }
    return letters;
}
}
