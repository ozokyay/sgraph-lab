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

  public treeControl = new NestedTreeControl<Cluster>(c => this.getChildren(c));
  public dataSource = new MatTreeNestedDataSource<Cluster>();
  public hasChild = (_: number, node: Cluster) => node.children && node.children.length > 0;

  public clusters: Cluster[] = [];
  public selectedCluster?: Cluster = undefined;

  constructor(private config: ConfigurationService) {
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

  private countChildren(c: Cluster): number {
    let count = 0;
    for (const i of c.children) {
      count += this.countChildren(this.getCluster(i)) + 1;
    }
    return count;
  }


  private getCluster(i: number): Cluster {
    const node = this.config.configuration.value.definition.graph.nodeDictionary.get(i)
    const child = node?.data as Cluster;
    return child;
  }

  private getChildren(c: Cluster): Cluster[] {
    const children: Cluster[] = [];
    for (const i of c.children) {
      const child = this.getCluster(i);
      children.push(child);
    }
    return children;
  }

  // https://bottosson.github.io/posts/oklab/
  // Call with fake root cluster
  private assignColor(v: Cluster, hRange: [number, number], cRange: [number, number], lRange: [number, number], f: number, perm: boolean, rev: boolean, mode: "proportional" | "uniform" | "fixed", depth: number = 0, sibling: number = 0): number {
    const [lb, ub] = [hRange[0], hRange[1]];
    const hue = (lb + ub) / 2;
    let depthFraction: number;

    const n = v.children.length;
    if (n > 0) {
      let s: [number, number][];
      if (mode == "proportional") {
        let counts = v.children.map(c => this.countChildren(this.getCluster(c)) + 1);
        const total = counts.reduce((a, b) => a + b);
        const cumulative = counts.reduce((acc: number[], curr: number, index: number) => [...acc, curr + (acc[index - 1] || 0)], []);
        const proportions = cumulative.map(n => n / total);
        s = Array.from({ length: n }, (_, i) => [lb + (ub - lb) * (i == 0 ? 0 : proportions[i - 1]), lb + (ub - lb) * proportions[i]]);
      } else if (mode == "uniform") {
        s = Array.from({ length: n }, (_, i) => [lb + (ub - lb) * (i / n), lb + (ub - lb) * ((i + 1) / n)]);
      } else {
        // Simply hardcode range to 5 as a tradeoff between width and depth
        if (depth > 0) {
          // Uniform
          s = Array.from({ length: 5 }, (_, i) => [lb + (ub - lb) * ((i % 5) / 5), lb + (ub - lb) * (((i % 5) + 1) / 5)]);
        } else {
          // More range to red
          s = [[0, 85], [85, 144], [144, 216], [236, 288], [288, 360]];
        }
      }

      // Problem: Deletion shifts clusters
      // Solution: Cluster note their siblingIndex, use this for everything
      // Also use last of this to determine next sibling color

      // Use siblingIndex here because this creates permuted ranges
      // Should use as offset if i - sIndex > 0 in fixed mode

      // Permute
      if (perm) {
        let perm;
        if (mode == "fixed") {
          perm = this.spread(5);
        } else {
          perm = this.spread(n);
        }
        const s2: [number, number][] = [];
        // Need to go over perm repeatedly
        for (let i = 0; i < n; i++) {
          if (mode == "fixed") {
            const sIndex = this.getCluster(v.children[i]).siblingIndex;
            s2.push(s[perm.indexOf((sIndex % 5) + 1)]);
          } else {
            s2.push(s[perm.indexOf(i + 1)]);
          }
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
        const d2 = this.assignColor(this.getCluster(v.children[i]), s[i], cRange, lRange, f, perm, rev, mode, depth + 1, i);
        d = Math.max(d, d2);
      }

      // Use max depth for local interpolation
      depthFraction = depth / d;
    } else {
      depthFraction = 1;
    }

    const chroma = cRange[0] + depthFraction * (cRange[1] - cRange[0]);
    const luminance = lRange[0] + depthFraction * (lRange[1] - lRange[0]);

    const l = luminance / 100;
    const c = chroma;
    const h = hue * Math.PI / 180;
    const sRGB = this.oklabToLinearSrgb(l, c * Math.cos(h), c * Math.sin(h));
    sRGB.r = Math.min(1, Math.max(0, sRGB.r));
    sRGB.g = Math.min(1, Math.max(0, sRGB.g));
    sRGB.b = Math.min(1, Math.max(0, sRGB.b));
    const RGB = {
      r: sRGB.r <= 0.0031308 ? 12.92 * sRGB.r : 1.055 * Math.pow(sRGB.r, 1/2.4) - 0.055,
      g: sRGB.g <= 0.0031308 ? 12.92 * sRGB.g : 1.055 * Math.pow(sRGB.g, 1/2.4) - 0.055,
      b: sRGB.b <= 0.0031308 ? 12.92 * sRGB.b : 1.055 * Math.pow(sRGB.b, 1/2.4) - 0.055,
    };
    v.color = `rgb(${RGB.r * 255}, ${RGB.g * 255}, ${RGB.b * 255})`;
    // v.color = `oklch(${luminance}% ${chroma} ${hue})`;

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

  private updateColors(clusters: Cluster[]) {
    const root: Cluster = {
      id: -1,
      parent: -1,
      name: "Root",
      color: "black",
      generator: new MGGenerator(),
      children: clusters.map(c => c.id),
      changeUUID: crypto.randomUUID(),
      siblingIndex: 0
    };

    const hRange: [number, number] = [0, 369];
    const cRange: [number, number] = [10 / 100 * 0.4, 45 / 100 * 0.4];
    const lRange: [number, number] = [96, 57];
    const hFrac = 1;
    this.assignColor(root, hRange, cRange, lRange, hFrac, true, false, "fixed");

    // Algorithm
    // - Up to 5: Fill from range [1, 2, 3, 4, 5] (permuted output)
    // - Next hue: take from pos i between starting range
    // - Insert in array at i, but cluster next
    // - Shift others to keep constant distance
    // - Advance i % #rootClusters (or better: next pos with max const dist for this level)

    // Algorithm 2
    // - Up to 5, fill from pre-computed 5-division and fixed permutation
    // - Next, keep last permutation and expand by one
    // - 


    // Actual problem: Expanding existing permutation by one

    // Workaround? 
    // - Start with good 7 permutation
    // - Repeat when expanding
    // - Cannot dstinguish too many colors anyway :)

    // Problem: Is this recursively better than TREECOLORS??? (no: imagine extreme cases of failure)

    // Workaround #2
    // - Manual color assignment button / auto checkbox

    // treecolor problem is threefold:
    // 1. Colors shifting (can use fixed, repeating)
    // 2. Colors permuting (can use fixed, repeating)
    // 3. Color range changes (no problem if fixed)
    // => Where is treecolors after these changes?
    // Disadavantages
    // - Not adapting to extreme cases (1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2) (this is okay)
    // - inconsistent behavior when going down layers
    // - Fix: disable perm? => also breaks a ton of stuff

    // New solution:
    // - Recursive fixed repeating ranges of 5 (only supports proportional)
    // - Seems stupid, but could work
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

    

    // TODO: Cluster gens generate children with number selector
    // TODO: Only allow manual child clusters if specific generator is selected OR have second + button for that purpose
    // TODO: Implement in builder


    // TODO: Prevent top level color permutation (reverse?) because of confusion, maybe limit to 7-10 scale repeating?
    // TODO: Alternatively: Color mode selection?
    // TODO: Proper subcluster naming (append child indices form hierarchy above)

    // Then
    // TODO: Matrix (levels)
    // TODO: Minimap (levels)
    // TODO: Tree
    // TODO: NL (levels)
    // TODO: Circle Packing (optional)
    // TODO: Distribution Tables
    // TODO: Attributes and assortativity
    // TODO: Top level colors fixed up to 5-10?
    // https://sites.cc.gatech.edu/gvu/ii/icet/


    // console.log(DegreesDefault);

    let sIndex;
    if (parent !== undefined) {
      if (parent.children.length > 0) {
        sIndex = this.getCluster(parent.children[parent.children.length - 1]).siblingIndex + 1;
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
      name: "Cluster " + this.numberToLetters(id + 1),
      generator: new CLGenerator(structuredClone(DegreesDefault), true),
      children: [],
      changeUUID: crypto.randomUUID(),
      siblingIndex: sIndex
    };

    const node: Node = { id: id, data: cluster };
    this.config.configuration.value.definition.graph.addNode(node);
    if (parent) {
      parent.children.push(cluster.id);
      this.treeControl.expand(parent);
    }

    const topLevel = this.config.configuration.value.definition.graph.getNodes().map(n => n.data as Cluster).filter(c => c.parent == -1);
    this.updateColors(topLevel);

    this.config.selectedCluster.next(cluster);
    this.config.update("Add cluster " + id);
  }

  public onRemoveCluster(event: MouseEvent, cluster: Cluster, update: boolean = true) {
    event.stopPropagation();
    if (cluster == this.selectedCluster) {
      this.config.selectedCluster.next(undefined);
    }
    for (const i of [...cluster.children]) {
      this.onRemoveCluster(event, this.getCluster(i), false);
    }
    if (cluster.parent != -1) {
      const p = this.getCluster(cluster.parent);
      p.children.splice(p.children.indexOf(cluster.id), 1);
    }
    const node = this.config.configuration.value.definition.graph.nodeDictionary.get(cluster.id)!;
    this.config.configuration.value.definition.graph.removeNode(node);
    if (update) {
      this.clusters = this.config.configuration.value.definition.graph.getNodes().map(n => n.data as Cluster).filter(c => c.parent == -1);
      this.updateColors(this.clusters);
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

  private oklabToLinearSrgb(L: number, a: number, b: number) {
    let l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    let m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    let s_ = L - 0.0894841775 * a - 1.2914855480 * b;

    let l = l_ * l_ * l_;
    let m = m_ * m_ * m_;
    let s = s_ * s_ * s_;

    return {
        r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    };
}
}
