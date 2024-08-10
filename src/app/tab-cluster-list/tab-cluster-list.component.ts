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
import { CLGenerator } from '../generators';

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

  constructor(private config: ConfigurationService) {
    // config.configuration.subscribe(configuration => {
    //   this.clusters = configuration.definition.graph.getNodes().map(n => n.data as Cluster);
    //   this.dataSource.data = this.clusters;
    // });

    // - Implement adding/deleting children
    // - Color algorithm => hierarchical color scale oh god recursive oklch
    // (- Color picker)
    // - generate children

    this.clusters = [
      {
        id: 0,
        name: "Cluster A",
        color: 0,
        children: [
          {
            id: 1,
            name: "Cluster A.1",
            color: 1,
            children: [],
            generator: new CLGenerator(DegreesDefault, true)
          },
          {
            id: 2,
            name: "Cluster A.2",
            color: 2,
            children: [],
            generator: new CLGenerator(DegreesDefault, true)
          }
        ],
        generator: new CLGenerator(DegreesDefault, true)
      }
    ];
    this.dataSource.data = this.clusters;
    config.selectedCluster.subscribe(cluster => this.selectedCluster = cluster);
  }

  public getColor(cluster: Cluster) {
    return d3.schemeCategory10[cluster.color % 10];
  }

  // https://bottosson.github.io/posts/oklab/
  // Call with fake root cluster
  private assignColor(v: Cluster, [lb, ub]: [number, number], f: number, perm: boolean, rev: boolean, prop: boolean) {
    const hue = (lb + ub) / 2;
    v.color = hue;
    // C, L local interpolation in suggested ranges
    // Need current and max depth information

    if (v.children.length > 0) {
      // Divide r in to N parts (proportionally flag)
      // Need subtree child counts
      const ri: [number, number][] = [];

      // [[ub, lb], [ub, lb]]
      const range = Array.from({ length: v.children.length }, (_, i) => [lb + (ub - lb) * (i / v.children.length), i]);

      // Reduce to middle fraction f

      // if perm then permute ris

      // if rev then reverse even ris

      for (let i = 0; i < v.children.length; i++) {
        this.assignColor(v.children[i], ri[i], f, perm, rev, prop);
      }
    }
  }

  // This does one step of hue division
  // 
  private addRange(
    x: [number[], number[], number[]],
    depth: number,
    frc: number = 0.5,
    huePerm: boolean = true,
    hueRev: boolean = true
): { lb: number[], ub: number[], rev: boolean[] } {
    
    const LB = x[0][0];
    const UB = x[1][0];
    const REV = x[2][0];
    
    const nr = x[0].length;
    
    const sq = Array.from({ length: nr + 1 }, (_, i) => LB + (UB - LB) * (i / nr));
    const spacer = (sq[1] - sq[0]) * (1 - frc) * 0.5;
    
    let s: number[];
    
    if (huePerm) {
        s = this.spread(nr);
    } else {
        s = Array.from({ length: nr }, (_, i) => i + 1);
    }
    
    if (hueRev && REV) {
        s = s.reverse();
    }
    
    const start = sq.slice(0, nr).sort((a, b) => s.indexOf(a) - s.indexOf(b));
    const end = sq.slice(1, nr + 1).sort((a, b) => s.indexOf(a) - s.indexOf(b));
    
    return {
        lb: start.map(v => Math.floor(v + spacer)),
        ub: end.map(v => Math.floor(v - spacer)),
        rev: Array.from({ length: nr }, (_, i) => i % 2 === 1)
    };
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

  public onAddCluster(event: MouseEvent, parent?: Cluster) {
    event.stopPropagation();

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

    const cluster: Cluster = {
      id: id,
      color: col,
      name: "Cluster " + this.numberToLetters(id + 1),
      generator: new CLGenerator(DegreesDefault, true),
      children: []
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
