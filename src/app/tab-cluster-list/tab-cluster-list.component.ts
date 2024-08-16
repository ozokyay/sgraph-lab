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

  public treeControl = new NestedTreeControl<Cluster>(c => c.children);
  public dataSource = new MatTreeNestedDataSource<Cluster>();
  public hasChild = (_: number, node: Cluster) => node.children && node.children.length > 0;

  public clusters: Cluster[] = [];
  public selectedCluster?: Cluster = undefined;

  // Here: Cluster[], nested structure (r)
  // Config: AdjacencyList, graph through all levels (rw)

  // Need both
  // Need sync

  constructor(private config: ConfigurationService) {
    config.configuration.subscribe(configuration => {
      this.clusters = configuration.definition.graph.getNodes().map(n => n.data as Cluster).filter(c => c.parent == -1); // Only root level nodes (group or leaf doesn't matter)
      this.dataSource.data = this.clusters;
    });

    // - Implement adding/deleting children
    // - generate children

    // this.clusters = [
    //   {
    //     id: 0,
    //     name: "Cluster A",
    //     color: "black",
    //     children: [
    //       {
    //         id: 1,
    //         name: "Cluster A.1",
    //         color: "black",
    //         children: [],
    //         generator: new CLGenerator(DegreesDefault, true)
    //       },
    //       {
    //         id: 2,
    //         name: "Cluster A.2",
    //         color: "black",
    //         children: [],
    //         generator: new CLGenerator(DegreesDefault, true)
    //       }
    //     ],
    //     generator: new CLGenerator(DegreesDefault, true)
    //   },
    //   {
    //     id: 3,
    //     name: "Cluster B",
    //     color: "black",
    //     children: [
    //       {
    //         id: 4,
    //         name: "Cluster B.1",
    //         color: "black",
    //         children: [],
    //         generator: new CLGenerator(DegreesDefault, true)
    //       },
    //       {
    //         id: 5,
    //         name: "Cluster B.2",
    //         color: "black",
    //         children: [],
    //         generator: new CLGenerator(DegreesDefault, true)
    //       }
    //     ],
    //     generator: new CLGenerator(DegreesDefault, true)
    //   },
    // ];

    // const root: Cluster = {
    //   id: -1,
    //   name: "Root",
    //   color: "black",
    //   generator: new CLGenerator(DegreesDefault, true),
    //   children: this.clusters
    // };

    // this.assignColor(root, [0, 360], [10, 45], [95, 57], 0.75, true, true, true);
    // console.log(this.clusters);

    this.dataSource.data = this.clusters;
    config.selectedCluster.subscribe(cluster => this.selectedCluster = cluster);
  }

  public getColor(cluster: Cluster) {
    return cluster.color;
  }

  private countChildren(c: Cluster): number {
    let count = 0;
    for (const x of c.children) {
      count += this.countChildren(x) + 1;
    }
    return count;
  }

  // https://bottosson.github.io/posts/oklab/
  // Call with fake root cluster
  private assignColor(v: Cluster, hRange: [number, number], cRange: [number, number], lRange: [number, number], f: number, perm: boolean, rev: boolean, prop: boolean, depth: number = 0, sibling: number = 0): number {
    const [lb, ub] = [hRange[0], hRange[1]];
    const hue = (lb + ub) / 2;
    let depthFraction: number;

    const n = v.children.length;
    if (n > 0) {
      let s: [number, number][];
      if (prop) {
        // Proportionally
        let counts = v.children.map(c => this.countChildren(c) + 1);
        const total = counts.reduce((a, b) => a + b);
        const cumulative = counts.reduce((acc: number[], curr: number, index: number) => [...acc, curr + (acc[index - 1] || 0)], []);
        const proportions = cumulative.map(n => n / total);
        s = Array.from({ length: n }, (_, i) => [lb + (ub - lb) * (i == 0 ? 0 : proportions[i - 1]), lb + (ub - lb) * proportions[i]]);
        // console.log("lb=" + lb + ", ub=" + ub);
        // console.log(proportions);
        // console.log(s);
      } else {
        // Uniform
        s = Array.from({ length: n }, (_, i) => [lb + (ub - lb) * (i / n), lb + (ub - lb) * ((i + 1) / n)]);
      }

      // Permute
      if (perm) {
        const perm = this.spread(n);
        const s2: [number, number][] = [];
        for (let i = 0; i < perm.length; i++) {
          s2.push(s[perm.indexOf(i + 1)]);
        }
        s = s2;
      }

      // Reverse
      if (rev && sibling % 2 == 0) {
        s = s.reverse();
      }

      // Reduce
      s = s.map(([lb, ub]) => [lb + (ub - lb) * (1 - f) * 0.5, ub + (lb - ub) * (1 - f) * 0.5]);

      let d = 0;
      for (let i = 0; i < n; i++) {
        const d2 = this.assignColor(v.children[i], s[i], cRange, lRange, f, perm, rev, prop, depth + 1, i);
        d = Math.max(d, d2);
      }

      // Use max depth for local interpolation
      depthFraction = depth / d;
    } else {
      depthFraction = 1;
    }

    const chroma = cRange[0] + depthFraction * (cRange[1] - cRange[0]);
    const luminance = lRange[0] + depthFraction * (lRange[1] - lRange[0]);
    v.color = `oklch(${luminance}% ${chroma}% ${hue})`;

    return depth;
  }

  private spread(n: number) {
    let s: number[];

    if (n < 5) {
        s = Array.from({ length: n }, (_, i) => i + 1);
        if (n > 2) {
            [s[1], s[2]] = [3, 2];
        }
    } else {
        const sStep = Math.floor(n / 2.5);
        s = Array.from({ length: n }, (_, i) => ((1 + i * sStep) % n) || n);

        // Find the index of the first duplicate
        const dupIndex = s.findIndex((value, index, array) => array.indexOf(value) !== index);

        // If exists
        if (dupIndex !== -1) {
            let adjustment = Array.from({ length: n }, (_, i) => Math.floor(i / dupIndex));
            s = s.map((value, index) => value + adjustment[index]);
        }
    }

    return s;
  }

  private updateColors() {
    const root: Cluster = {
      id: -1,
      parent: -1,
      name: "Root",
      color: "black",
      generator: new MGGenerator(),
      children: this.clusters
    };

    this.assignColor(root, [0, 360], [10, 45], [95, 57], 0.75, true, true, true);
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

    // Should not have hierarchy in graph definition
    // Only leaves should form this graph
    // This makes things easier
    // But how to edit on different levels then?
    // Also need serializability!!

    // TODO: Invisible root cluster (for color and max id)
    // TODO: Get max id => needed? should groups be modeled as clusters? Doesn't quite make sense...
    // TODO: Only allow manual child clusters if specific (default?) generator is selected
    // TODO: Make children nodes?
    // TODO: Fix builder not finding child level clusters
    // TODO: Assign colors
    // TODO: Color mode selection

    // Then
    // TODO: Matrix (levels)
    // TODO: Minimap (levels)
    // TODO: Tree
    // TODO: NL (levels)
    // TODO: Circle Packing (optional)
    // TODO: Distribution Tables
    // TODO: Attributes and assortativity


    const cluster: Cluster = {
      id: id,
      parent: parent?.id || -1,
      color: "black",
      name: "Cluster " + this.numberToLetters(id + 1),
      generator: new CLGenerator(DegreesDefault, true), // TODO: Separate buttons for root level groups, hide add for CL/CM gen
      children: [] // TODO: This serialization causes redundant async references (either restore on load or restore here in constructor)
    };

    const node: Node = { id: id, data: cluster };
    this.config.configuration.value.definition.graph.addNode(node);
    if (parent) {
      parent.children.push(cluster);
      this.treeControl.expand(parent);
    }
    this.config.selectedCluster.next(cluster);
    this.config.update("Add cluster " + id);
  }

  public onRemoveCluster(event: MouseEvent, cluster: Cluster) {
    event.stopPropagation();
    if (cluster == this.selectedCluster) {
      this.config.selectedCluster.next(undefined);
    }
    for (const child of cluster.children) {
      const node = this.config.configuration.value.definition.graph.nodeDictionary.get(child.id)!;
      this.config.configuration.value.definition.graph.removeNode(node);      
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
