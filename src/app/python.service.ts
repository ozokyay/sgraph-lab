import * as py from 'pyodide';
import * as d3 from 'd3';
import { Injectable } from '@angular/core';
import { EdgeList } from './graph';
import { Series } from './series';
import { Point } from './point';

@Injectable({
  providedIn: 'root'
})
export class PythonService {

  public pyodide?: py.PyodideInterface;

  constructor() { }

  public async initPython(): Promise<py.PyodideInterface> {
    // const pyodide = await py.loadPyodide({
    //     indexURL: "pyodide"
    // });
    const pyodide = await py.loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/"
    });
    await pyodide.loadPackage("micropip");
    await pyodide.loadPackage("networkx");
    //await pyodide.loadPackage("scipy");
    this.pyodide = pyodide;
    return pyodide;
  }

  public generateChungLu(degrees: number[]): EdgeList {
    this.pyodide!.globals['set']("degrees", degrees);
    const obj = this.pyodide!.runPython(`
    import networkx as nx
    
    G = nx.expected_degree_graph(degrees, selfloops=False)
    
    nx.node_link_data(G)
    `);
    const graph = obj.toJs({dict_converter : Object.fromEntries});
    return EdgeList.fromNetworkX(graph.nodes, graph.links);
  }

  public generateConfiguration(degrees: number[]): EdgeList {
    this.pyodide!.globals['set']("degrees", degrees);
    const obj = this.pyodide!.runPython(`
    import networkx as nx
    
    G = nx.configuration_model(degrees)
    G = nx.Graph(G)
    G.remove_edges_from(nx.selfloop_edges(G))
    
    nx.node_link_data(G)
    `);
    const graph = obj.toJs({dict_converter : Object.fromEntries});
    return EdgeList.fromNetworkX(graph.nodes, graph.links);
  }

  public setGraph(input: EdgeList) {
    this.pyodide!.globals['set']("edges", input.edges.map(e => [e.source.id, e.target.id]));
    this.pyodide!.runPython(`
    import networkx as nx
    G = nx.Graph(edges.to_py())`);
  }

  public extractGiantComponent(input: EdgeList): EdgeList {
    this.pyodide!.globals['set']("edges", input.edges.map(e => [e.source.id, e.target.id]));
    const obj = this.pyodide!.runPython(`
    import networkx as nx
    
    G = nx.Graph(edges.to_py())
    largest_cc = max(nx.connected_components(G), key=len)
    H = G.subgraph(largest_cc)
    H = nx.convert_node_labels_to_integers(H)
    nx.node_link_data(H)
    `);
    const graph = obj.toJs({dict_converter : Object.fromEntries});
    return EdgeList.fromNetworkX(graph.nodes, graph.links);
}

  // Unused
  public sampleRandomEdgeNode(input: EdgeList, edges: number) {
    this.pyodide!.globals['set']("edges", input.edges.map(e => [e.source, e.target]));
    const obj = this.pyodide!.runPython(`
    import networkx as nx
    import numpy as np

    G = nx.Graph(edges.to_py())
    rng = np.random.default_rng()
    edges = rng.choice(G.edges, size=${edges})
    H = nx.induced_subgraph(G, edges.flatten())
    H = nx.convert_node_labels_to_integers(H)
    nx.node_link_data(H)`);
    const graph = obj.toJs({dict_converter : Object.fromEntries});
    return EdgeList.fromNetworkX(graph.nodes, graph.links);
  }

  // Unused
  public linearSumAssignment(a: number[], b: number[], noise: number = 0): [number, number][] {
    this.pyodide!.globals['set']("dist_a", a);
    this.pyodide!.globals['set']("dist_b", b);
    const obj = this.pyodide!.runPython(`
    import numpy as np
    from scipy.optimize import linear_sum_assignment
    from scipy.spatial import distance_matrix

    cost = distance_matrix(np.matrix(dist_a.to_py()).T, np.matrix(dist_b.to_py()).T, p=1)
    row_ind, col_ind = linear_sum_assignment(cost)
    list(zip(row_ind.tolist(), col_ind.tolist()))`);
    return obj.toJs();
  }

  public async getSimpleMeasure(measure: "degree_assortativity_coefficient" | "degree_pearson_assortativity_coefficient"): Promise<number> {
    const obj = await this.pyodide!.runPythonAsync(`
    import networkx as nx

    nx.degree_assortativity_coefficient(G)`);
    return obj;
  }

  public async getGraphMeasure(measure: "clustering" | "pagerank" | "eigenvector_centrality" | "betweenness_centrality", bins: number): Promise<Series> {
    const obj = await this.pyodide!.runPythonAsync(`
    import networkx as nx
    import numpy as np

    measure = nx.${measure}(G)
    data = list(measure.values())
    hist = np.histogram(data, ${bins})
    list(zip(hist[1][1:], hist[0].tolist()))`);
    const list: any[] = obj.toJs();
    const points: Point[] = list.map(e => ({ x: e[0], y: e[1] }));
    return {
      data: points,
      xExtent: d3.extent(points, p => p.x) as [number, number],
      yExtent: d3.extent(points, p => p.y) as [number, number]
    }
  }

  public async getClusteringCoefficientDistribution2(): Promise<Series> {
    const obj = await this.pyodide!.runPythonAsync(`
    import networkx as nx
    import numpy as np

    H = nx.convert_node_labels_to_integers(G)
    clustering = list(nx.clustering(H).values())
    [clustering, list(H.degree)]`);
    const arrays = obj.toJs();
    const maxDeg = d3.max(arrays[1], (a: number[]) => a[1])!;
    const degToCC: number[] = new Array(maxDeg);
    const degToCount: number[] = new Array(maxDeg);
    degToCC.fill(0);
    degToCount.fill(0);
    for (const [n, d] of arrays[1]) {
      degToCC[d] += arrays[0][n];
      degToCount[d]++;
    }
    for (let i = 0; i < degToCC.length; i++) {
      degToCC[i] /= Math.max(1, degToCount[i]);
    }
    const points: Point[] = degToCC.map((v, i) => ({ x: i, y: v }));
    return {
      data: points,
      xExtent: d3.extent(points, p => p.x) as [number, number],
      yExtent: d3.extent(points, p => p.y) as [number, number]
    }
  }

  public async getDiameter(): Promise<number> {
    const obj = await this.pyodide!.runPythonAsync(`
    import networkx as nx
    nx.diameter(G)`);
    return obj;
  }
}