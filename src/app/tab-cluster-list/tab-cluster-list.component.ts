import { Component } from '@angular/core';
import { ConfigurationService } from '../configuration.service';
import { DegreesDefault, Series } from '../series';
import { Cluster } from '../cluster';
import * as d3 from 'd3';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { NestedTreeControl } from '@angular/cdk/tree';
import { MatTreeNestedDataSource, MatTreeModule } from '@angular/material/tree';
import { MatIconModule } from '@angular/material/icon';
import { NgClass, NgFor } from '@angular/common';
import { Node } from '../graph';
import { CLGenerator, MGGenerator } from '../generators';
import { Utility } from '../utility';

@Component({
  selector: 'app-tab-cluster-list',
  standalone: true,
  imports: [
    MatListModule,
    MatTreeModule,
    MatButtonModule,
    MatIconModule,
    NgClass,
    NgFor
  ],
  templateUrl: './tab-cluster-list.component.html',
  styleUrl: './tab-cluster-list.component.css'
})
export class TabClusterListComponent {

  public treeControl = new NestedTreeControl<Cluster>(c => Utility.getChildren(c));
  public dataSource = new MatTreeNestedDataSource<Cluster>();
  public hasChild = (_: number, node: Cluster) => node.children && node.children.length > 0;

  public clusters: Cluster[] = [];
  public selectedCluster?: Cluster = undefined;

  constructor(private config: ConfigurationService) {
    Utility.config = config;
    config.configuration.subscribe(configuration => {
      this.clusters = configuration.definition.graph.getNodes().map(n => n.data as Cluster).filter(c => c.parent == -1); // Only root level nodes
      this.dataSource.data = [];
      this.dataSource.data = this.clusters;
    });
    config.selectedCluster.subscribe(cluster => this.selectedCluster = cluster);
  }

  public getColor(cluster: Cluster) {
    return cluster.color;
  }

  public onAddCluster(event: MouseEvent, parent?: Cluster) {
    event.stopPropagation();

    // Use colors like ids, but reorder to quickly find next
    // const colors = [...this.clusters.map(c => c.color)]
    // colors.sort();
    // let col: number = 0;
    // for (const c of colors) {
    //   if (c == col) {
    //     col++;
    //   } else {
    //     break;
    //   }
    // }

    let id = 0;
    if (this.clusters.length > 0) {
      const nodes = [...this.config.configuration.value.definition.graph.nodeDictionary.values()]
      const latestNode = nodes[nodes.length - 1];
      const latestCluster = latestNode.data as Cluster;
      id = latestCluster.id + 1;
    }

    // Then
    // TODO: Matrix (levels)
    // TODO: Minimap (levels)
    // TODO: NL (levels)
    // TODO: Distribution Tables
    // TODO: Attributes and assortativity
    // TODO: Circle Packing
    // TODO: (Tree)
    // https://sites.cc.gatech.edu/gvu/ii/icet/

    let sIndex;
    if (parent !== undefined) {
      if (parent.children.length > 0) {
        sIndex = Utility.getCluster(parent.children[parent.children.length - 1]).siblingIndex + 1;
      } else {
        sIndex = 0;
      }
    } else {
      if (this.clusters.length == 0) {
        sIndex = 0;
      } else {
        sIndex = this.clusters[this.clusters.length - 1].siblingIndex + 1;
      }
    }

    const cluster: Cluster = {
      id: id,
      parent: parent !== undefined ? parent.id : -1,
      color: "black",
      name: parent === undefined ? "Cluster " + this.numberToLetters(sIndex + 1) : parent.name + "." + (sIndex + 1),
      generator: new CLGenerator(structuredClone(DegreesDefault), true),
      children: [],
      changeUUID: crypto.randomUUID(),
      siblingIndex: sIndex,
      replication: 1,
      immutable: false
    };

    const node: Node = { id: id, data: cluster };
    this.config.configuration.value.definition.graph.addNode(node);
    if (parent) {
      parent.children.push(cluster.id);
      this.treeControl.expand(parent);
    }

    const topLevel = this.config.configuration.value.definition.graph.getNodes().map(n => n.data as Cluster).filter(c => c.parent == -1);
    Utility.updateColors(topLevel);

    this.config.selectedCluster.next(cluster);
    this.config.update("Add cluster " + id);
  }

  public onRemoveCluster(event: MouseEvent, cluster: Cluster, update: boolean = true) {
    event.stopPropagation();
    if (cluster == this.selectedCluster) {
      this.config.selectedCluster.next(undefined);
    }
    for (const i of [...cluster.children]) {
      this.onRemoveCluster(event, Utility.getCluster(i), false);
    }
    if (cluster.parent != -1) {
      const p = Utility.getCluster(cluster.parent);
      p.children.splice(p.children.indexOf(cluster.id), 1);
    }
    const node = this.config.configuration.value.definition.graph.nodeDictionary.get(cluster.id)!;
    this.config.configuration.value.definition.graph.removeNode(node);
    if (update) {
      this.clusters = this.config.configuration.value.definition.graph.getNodes().map(n => n.data as Cluster).filter(c => c.parent == -1);
      Utility.updateColors(this.clusters);
      this.config.update("Remove cluster " + node.id);
    }
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
