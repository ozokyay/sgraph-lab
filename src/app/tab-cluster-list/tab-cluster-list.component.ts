import { Component } from '@angular/core';
import { ConfigurationService } from '../configuration.service';
import { DegreesDefault, Series } from '../series';
import { Cluster } from '../cluster';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { NestedTreeControl } from '@angular/cdk/tree';
import { MatTreeNestedDataSource, MatTreeModule } from '@angular/material/tree';
import { MatIconModule } from '@angular/material/icon';
import { NgClass, NgFor } from '@angular/common';
import { Node } from '../graph';
import { CLGenerator, MGGenerator } from '../generators';
import { Utility } from '../utility';
import { TutorialService } from '../tutorial.service';

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
  public edit: boolean = true;
  public deselect: boolean = true;

  public treeControl = new NestedTreeControl<Cluster>(c => Utility.getChildren(c));
  public dataSource = new MatTreeNestedDataSource<Cluster>();
  public hasChild = (_: number, node: Cluster) => node.children && node.children.length > 0;

  public clusters: Cluster[] = [];
  public selectedCluster?: Cluster = undefined;
  public highlight = new Map<Cluster, boolean>();
  public hidden = new Set<number>();

  constructor(private config: ConfigurationService, public tutorial: TutorialService) {
    Utility.config = config;
    config.configuration.subscribe(configuration => {
      this.clusters = configuration.definition.graph.getNodes().map(n => n.data as Cluster).filter(c => c.parent == -1); // Only root level nodes
      this.dataSource.data = [];
      this.dataSource.data = this.clusters;
      this.highlight.clear();
      for (const c of this.clusters) {
        this.highlight.set(c, false); // Selected connections will always be clear when adding
      }
    });
    config.selectedCluster.subscribe(cluster => this.selectedCluster = cluster);
    config.hiddenClusters.subscribe(clusters => {
      this.hidden.clear();
      for (const c of clusters) {
        this.hidden.add(c);
      }
    });
    // config.activeTab.subscribe(t => {
    //   this.edit = t != 1;
    // });
    config.selectedConnections.subscribe(connections => {
      for (const c of this.highlight.keys()) {
        this.highlight.set(c, false);
      }
      for (const c of connections) {
        this.highlight.set(c.source.data as Cluster, true);
        this.highlight.set(c.target.data as Cluster, true);
      }
    });
    tutorial.start.subscribe(() => {
      for (const c of this.clusters) {
        if (c.parent == -1) {
          this.treeControl.expand(c);
        }
      }
    });
  }

  public getColor(cluster: Cluster) {
    return cluster.color;
  }

  public onAddCluster(event: MouseEvent, parent?: Cluster) {
    event.stopPropagation();

    if (this.clusters.length == 0 && this.config.activeTab.value == 0) {
      this.config.activeTab.next(1);
    }

    let id = 0;
    if (this.clusters.length > 0) {
      const nodes = [...this.config.configuration.value.definition.graph.nodeDictionary.values()]
      const latestNode = nodes[nodes.length - 1];
      const latestCluster = latestNode.data as Cluster;
      id = latestCluster.id + 1;
    }

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
    this.config.hiddenClusters.value.delete(cluster.id);
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
    if (this.config.selectedCluster.value == cluster && this.deselect) {
      this.config.selectedCluster.next(undefined);
      return;
    }
    this.config.selectedCluster.next(cluster);
  }

  public onToggleVisibility(event: MouseEvent, cluster: Cluster) {
    event.stopPropagation();
    this.setVisibility(cluster, this.config.hiddenClusters.value.has(cluster.id));
    this.config.hiddenClusters.next(this.config.hiddenClusters.value);
  }

  private setVisibility(cluster: Cluster, visible: boolean) {
    if (visible) {
      this.config.hiddenClusters.value.delete(cluster.id);
    } else {
      this.config.hiddenClusters.value.add(cluster.id);
    }
    for (const c of cluster.children) {
      const node = this.config.configuration.value.definition.graph.nodeDictionary.get(c)!;
      this.setVisibility(node.data as Cluster, visible);
    }
  }

  public onHoverCluster(cluster?: Cluster) {
    this.config.hoveredCluster.next(cluster);
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
