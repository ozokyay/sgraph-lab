import { Injectable } from '@angular/core';
import { AdjacencyList, EdgeList, Node, Edge } from './graph';
import { Utility } from './utility';

/**
 * This class contains code translated from networkx.
 */

// Missing from networkx:
// - Local Clustering Coefficient -> Triangles
// - Local Clustering Coefficient 2 -> LCC
// - Diameter -> MatMul / AllPairs
// - Eigenvector Centrality -> MatMul
// - Degree Assortativity Coefficient -> MixingMat

@Injectable({
  providedIn: 'root'
})
export class LocalService {


  // Advantages: Faster and direct access to random state

  constructor() { }

  public generateChungLu(w: number[], selfLoops: boolean = false): EdgeList {
    const n: number = w.length;
    const G: EdgeList = { nodes: [], edges: [] };

    if (n == 0 || Math.max(...w) == 0) {
      return G;
    }

    G.nodes.push(...w.map((v, i) => { return { id: i } }));

    const rho = 1 / w.reduce((a, b) => a + b);

    const order = [...w.entries()].sort((a, b) => b[1] - a[1]);
    const mapping = new Map(order.map(([c, v], i) => [c, i]));
    const seq = order.map(([, v]) => v);
    let last = n;
    if (!selfLoops) {
      last -= 1;
    }
    for (let u = 0; u < last; u++) {
      let v = u;
      if (!selfLoops) {
        v += 1;
      }
      const factor = seq[u] * rho;
      let p = Math.min(seq[v] * factor, 1);
      while (v < n && p > 0) {
        if (p != 1) {
          const r = Utility.rand.next();
          v += Math.floor(Math.log(r) / Math.log(1 - p));
        }
        if (v < n) {
          const q = Math.min(seq[v] * factor, 1);
          if (Utility.rand.next() < q / p) {
            G.edges.push({ source: G.nodes[mapping.get(u)!], target: G.nodes[mapping.get(v)!] });
          }
          v += 1;
          p = q;
        }
      }
    }

    return G;
  }

  public generateConfigurationModel(degSequence: number[], selfLoops: boolean = false): EdgeList {
      if (degSequence.reduce((a, b) => a + b) % 2 != 0) {
        throw new Error("Node count must be even!");
      }

      const n = degSequence.length;
      const G: EdgeList = { nodes: Array.from(degSequence.keys()).map(i => { return { id: i }}), edges: [] };

      function toStublist(degrees: number[]) {
          const stublist = [];
          for (let i = 0; i < degrees.length; i++) {
              stublist.push(...Array(degrees[i]).fill(i));
          }
          return stublist;
      }

      // Handle zero case
      if (n == 0) {
          return G;
      }

      const stublist = toStublist(degSequence);
      const half = Math.floor(stublist.length / 2);
      Utility.shuffleArray(stublist);
      const [outStublist, inStublist] = [stublist.slice(0, half), stublist.slice(half)];

      for (let i = 0; i < outStublist.length; i++) {
          const u = outStublist[i];
          const v = inStublist[i];
          if (!selfLoops || u === v) {
            G.edges.push({source: G.nodes[u], target: G.nodes[v]});
          }
      }
      return G;
  }

  public extractGiantComponent(G: AdjacencyList): EdgeList {
    const seen: Set<Node> = new Set();

    // Implement DFS
    function dfs(v: Node, marked: Set<Node>, comp: Node[]) {
      for (const [edge, neighbor] of G.nodes.get(v)!) {
        if (!marked.has(neighbor)) {
          marked.add(neighbor);
          comp.push(neighbor);
          dfs(neighbor, marked, comp);
        }
      }
    }

    let component: Node[] = [];

    // Keep largest connected component
    for (const v of G.nodes.keys()) {
      if (!seen.has(v)) {
        seen.add(v);
        const comp: Node[] = [v];
        dfs(v, seen, comp);
        if (comp.length > component.length) {
          component = comp;
        }
      }
    }

    // Induced subgraph
    function induced(nodes: Node[]): EdgeList {
      const edges: Edge[] = [];
      const set: Set<number> = new Set();
      for (const u of nodes) {
        for (const [e, v] of G.nodes.get(u)!) {
          if (!set.has((u.id << 16) | v.id) && !set.has((v.id << 16) | u.id)) {
            set.add((u.id << 16) | v.id);
            edges.push({ source: u, target: v });
          }
        }
      }

      return {
        nodes: nodes,
        edges: edges
      };
    }

    return induced(component);
  }
}
