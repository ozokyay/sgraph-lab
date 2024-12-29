import { EdgeList, Edge, Node, AdjacencyList } from "./graph";
import { Point } from "./point";
import { Series } from "./series";
import Rand from 'rand-seed';
import * as d3 from 'd3';
import { CLGenerator, CMGenerator, ERGenerator, MGGenerator } from "./generators";
import { Cluster } from "./cluster";
import { ConfigurationService } from "./configuration.service";
import { ClusterConnection } from "./cluster-connection";

export class Utility {
    public static rand = new Rand('default');
    public static config: ConfigurationService;

    // https://stackoverflow.com/questions/29085197/how-do-you-json-stringify-an-es6-map
    private static replacer(key: string, value: any) {
      if (value instanceof Map) {
        return {
          dataType: 'Map',
          value: Array.from(value.entries()), // or with spread: value: [...value]
        };
      } else if (value instanceof AdjacencyList) {
        return {
          dataType: 'AdjacencyList',
          value: new EdgeList(value)
        };
      } else {
        return value;
      }
    }

    private static reviver(key: string, value: any) {
      if (typeof value === 'object' && value !== null) {
        if (value.dataType === 'Map') {
          return new Map(value.value);
        } else if (value.dataType == 'AdjacencyList') {
          return new AdjacencyList(value.value, true);
        } else if (value.name == 'CL' && value.degreeDistribution != undefined) {
          return new CLGenerator(value.degreeDistribution, value.extractGiantComponent);
        } else if (value.name == "CM" && value.degreeDistribution != undefined) {
          return new CMGenerator(value.degreeDistribution, value.extractGiantComponent);
        } else if (value.name == "ER" && value.nodeCount != undefined && value.edgeCount != undefined) {
          return new ERGenerator(value.nodeCount, value.edgeCount, value.extractGiantComponent);
        } else if (value.name == "MG" && value.group != undefined) {
          return new MGGenerator();
        }
      }
      return value;
    }

    public static stringify(obj: any): string {
      return JSON.stringify(obj, this.replacer);
    }

    public static parse(str: string): any {
      return JSON.parse(str, this.reviver);
    }

    // https://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
    public static shuffleArray(array: any[]) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(this.rand.next() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    public static sampleRandomEdges(input: EdgeList, edgeCount: number): EdgeList {
        const allEdges = [...input.edges];
    
        // Random edge sampling
        Utility.shuffleArray(allEdges);
        const sample = allEdges.slice(0, edgeCount)
        const nodeSet = new Set<Node>();
        for (const e of sample) {
          if (!nodeSet.has(e.source)) {
            nodeSet.add(e.source);
          }
          if (!nodeSet.has(e.target)) {
            nodeSet.add(e.target);
          }
        }
        // Induced subgraph
        // for (const e of allEdges) {
        //   if (!edges.has(e) && nodes.has(e.sourceNode) && nodes.has(e.targetNode)) {
        //     edges.add(e);
        //   }
        // }
        return { nodes: [...nodeSet.values()], edges: sample };
    }

    public static addDistributions(d1: Series, d2: Series): Series {
      const data: Point[] = [];
      let i1 = 0; // indices
      let i2 = 0;
      while (i1 < d1.data.length || i2 < d2.data.length) {
        const p1 = d1.data[i1];
        const p2 = d2.data[i2];
        if (p2 == undefined || p1 != undefined && p1.x < p2.x) {
          data.push({
            x: p1.x,
            y: p1.y
          });
          i1++;
        } else if (p1 == undefined || p2.x < p1.x) {
          data.push({
            x: p2.x,
            y: p2.y
          });
          i2++;
          console.log(`p2.x < p1.x ${i1} ${i2} x = ${p2.x} y = ${p2.y * 2}`);
        } else {
          data.push({
            x: p1.x,
            y: p1.y + p2.y
          });
          i1++;
          i2++;
        }
      }
      return {
        data: data,
        xExtent: [Math.min(d1.xExtent[0], d2.xExtent[0]), Math.max(d1.xExtent[1], d2.xExtent[1])],
        yExtent: [Math.min(d1.yExtent[0], d2.yExtent[0]), Math.max(d1.yExtent[1], d2.yExtent[1])]
      };
    }

    public static averageDistributions(distributions: Series[]): Series {
      const xDict = new Map<number, [number, number]>();
      for (const d of distributions) {
        for (const p of d.data) {
          const [value, count] = xDict.get(p.x) ?? [0, 0];
          xDict.set(p.x, [value + p.y, count + 1]);
        }
      }
      const data = [...xDict.entries()].map(([x, [value, count]]) => { return { x: x, y: value / count }; });
      data.sort((a, b) => a.x - b.x);
      const xExtent = [Math.min(...distributions.map(d => d.xExtent[0])), Math.max(...distributions.map(d => d.xExtent[1]))];
      const ys = data.map(p => p.y);
      const yExtent = [Math.min(...ys), Math.max(...ys)]
      return {
        data: data,
        xExtent: xExtent,
        yExtent: yExtent
      };
    }

    public static multiply(data: number[], n: number) {
      for (let i = 0; i < data.length; i++) {
        data[i] *= n;
      }
    }

    public static multiplyPointValues(points: Point[], n: number) {
      for (const p of points) {
        p.y *= n;
      }
    }

    public static multiplyDistribution(s: Series, n: number) {
      this.multiplyPointValues(s.data, n);
    }

    // From points to distribution
    public static computeDistribution(series: Series, step = 1): Point[] {
      const distribution: Point[] = [];
      let p = 0;
      let previous = series.data[0];
      let next = series.data[1];
      const [min, max] = series.xExtent;
      for (let i = min; i <= max; i += step) {
        if (i > next.x) {
          p++;
          previous = next;
          next = series.data[p + 1]
        }
        if (next == undefined) {
          break;
        }
        const proportion = (i - previous.x) / (next.x - previous.x);
        const y = previous.y + proportion * (next.y - previous.y);
        distribution.push({ x: i, y: y});
      }
      
      return distribution;
    }

    public static deepCopyPoints(points: Point[]): Point[] {
      const data: Point[] = [];
      for (const p of points) {
        data.push({
          x: p.x,
          y: p.y
        });
      }
      return data;
    }

    public static deepCopyDistribution(s: Series): Series {
      return {
        data: this.deepCopyPoints(s.data),
        xExtent: [...s.xExtent],
        yExtent: [...s.yExtent]
      }
    }

    public static simplifyDistribution(s: Point[]): Point[] {
      const points: Point[] = [ s[0] ];
      for (let i = 0; i < s.length - 2; i++) {
        const start = s[i];
        const middle = s[i + 1];
        const end = s[i + 2]
        if (Math.abs(middle.y - (start.y + end.y) / 2) >= 0.0001) {
          points.push(middle);
        }
      }
      points.push(s[s.length - 1]);
      return points;
    }

    // Bias is sparse distribution, y in [0, 1]
    // Data is dense distribution
    public static computeBiasedProportions(data: Series, bias: Series): Point[] {
      const b = this.computeDistribution(bias);
      data = this.deepCopyDistribution(data);
      data.yExtent = [0, 1];
      const allZero = bias.data.filter(p => p.y == 0).length == bias.data.length;
      if (!allZero) {
        for (let i = 0; i < Math.min(b.length, data.data.length); i++) {
          data.data[i].y *= b[i].y;
        }
      }
      const sum = d3.sum(data.data.map(p => p.y))!;
      if (sum != 0)
        this.multiplyDistribution(data, 1 / sum);
      return data.data;
    }

    public static computeNodeDegrees(graph: EdgeList): Map<Node, number> {
      const degrees = new Map<Node, number>();
      for (const node of graph.nodes) {
        degrees.set(node, 0);
      }
      for (const edge of graph.edges) {
        degrees.set(edge.source, degrees.get(edge.source)! + 1);
        degrees.set(edge.target, degrees.get(edge.target)! + 1);
      }
      return degrees;
    }

    public static sortNodeDegrees(degrees: [Node, number][]): Map<number, Node[]> {
      const buckets = new Map<number, Node[]>();
      for (const [n, d] of degrees) {
        buckets.set(d, [...(buckets.get(d) || []), n]);
      }
      return buckets;
    }

    public static drawProportionally(count: number, buckets: Map<number, Node[]>, proportions: Point[]): Node[] {
      let nodes: Node[] = [];
      let n1 = 0;
      while (n1 < count) {
        for (let j = 0; j < proportions.length; j++) {
          const proportion = proportions[j];
          if (proportion.y <= 0) {
            proportions.splice(j, 1);
            j--;
            continue;
          }
          let bucket = buckets.get(proportion.x);
          if (bucket == undefined || bucket.length == 0) {
            // console.log("searching " + proportion.x);
            // Find next left or right
            let i = 1;
            while (Math.abs(i) < 2 * buckets.size) {
              bucket = buckets.get(proportion.x + i);
              if (bucket != undefined && bucket.length > 0) {
                buckets.set(proportion.x, bucket);
                // console.log("taking " + proportion.x + i);
                break;
              }
              i = i > 0 ? (-i) : (-i + 1);
            }
          }
          if (bucket != undefined) {
            proportion.y -= 1;
            // console.log("applying " + proportion.x);
            nodes.push(bucket.pop()!);
          } else {
            console.log("Not enough nodes");
          }
          n1++;
          if (n1 >= count) {
            break;
          }
        }
      }
      return nodes;
    }

    public static getDegreeDistribution(degrees: Map<Node, number>): Series {
      const degreeBuckets = Utility.sortNodeDegrees([...degrees.entries()]);
      const degreePoints: Point[] = [];
      for (const [d, b] of degreeBuckets) {
        degreePoints.push({
          x: d,
          y: b.length
        });
      }
      degreePoints.sort((a, b) => a.x - b.x);
      const distribution: Series = {
        data: degreePoints,
        xExtent: d3.extent(degreePoints, p => p.x) as [number, number],
        yExtent: d3.extent(degreePoints, p => p.y) as [number, number]
      };
      return distribution;
    }

    public static extraAssortativityEdges(g: EdgeList, count: number) {
        const adj = new AdjacencyList(g);
        const degMap = Utility.computeNodeDegrees(g);
        const degrees = [...degMap.entries()];
        const combinations: Edge[] = [];
        for (let i = 0; i < degrees.length; i++) {
            for (let j = 0; j < i; j++) {
                if (i == j) {
                    continue;
                }
                const distance = Math.abs(degrees[i][1] - degrees[j][1]);
                if (adj.nodes.get(degrees[i][0])!.find(([e, n]) => n == degrees[j][0]) == undefined) {
                    combinations.push({ source: degrees[i][0], target: degrees[j][0], data: distance });
                }
            }
        }
        combinations.sort((a, b) => (a.data as number) - (b.data as number));
        g.edges.push(...combinations.slice(0, Math.min(count, combinations.length)));
    }

    public static arraysEqual(a: Point[], b: Point[]): boolean {
      if (a.length != b.length) {
        return false;
      }
      for (let i = 0; i < a.length; i++) {
        if (a[i].x != b[i].x || a[i].y != b[i].y) {
          return false;
        }
      }
      return true;
    }

    public static fitDistributionToExtent(distribution: Series) {
      // Shorten if too long
      for (let i = 0; i < distribution.data.length; i++) {
        const point = distribution.data[i];
        if (point.x > distribution.xExtent[1]) {
          distribution.data.splice(i, distribution.data.length - i);
          break;
        }
      }
      // Add end point if missing
      let lastPoint = { x: distribution.xExtent[1], y: 0.5 };
      if (distribution.data[distribution.data.length - 1].x < distribution.xExtent[1]) {
        distribution.data.push(lastPoint);
      }

      // Sometimes one or more unnecessary in middle
      // => Cleanup (step for) redundant points in middle
    }

    public static countChildren(c: Cluster): number {
      let count = 0;
      for (const i of c.children) {
        count += this.countChildren(this.getCluster(i)) + 1;
      }
      return count;
    }
  
  
    public static getCluster(i: number): Cluster {
      const node = this.config.configuration.value.definition.graph.nodeDictionary.get(i)
      const child = node?.data as Cluster;
      return child;
    }
  
    public static getChildren(c: Cluster): Cluster[] {
      const children: Cluster[] = [];
      for (const i of c.children) {
        const child = this.getCluster(i);
        children.push(child);
      }
      return children;
    }

    public static swapEdge(e: Edge) {
      const conn = e.data as ClusterConnection;
      [e.source, e.target] = [e.target, e.source];
      [conn.sourceDegreeDistribution, conn.targetDegreeDistribution] = [conn.targetDegreeDistribution, conn.sourceDegreeDistribution];
      [conn.sourceNodeCount, conn.targetNodeCount] = [conn.targetNodeCount, conn.sourceNodeCount];
    }
  
    // https://bottosson.github.io/posts/oklab/
    // Call with fake root cluster
    public static assignColor(v: Cluster, hRange: [number, number], cRange: [number, number], lRange: [number, number], f: number, perm: boolean, rev: boolean, mode: "proportional" | "uniform" | "fixed", depth: number = 0, sibling: number = 0): number {
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
        // Use siblingIndex offset here
  
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
  
    public static spread(n: number) {
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
  
    public static updateColors(clusters: Cluster[]) {
      const root: Cluster = {
        id: -1,
        parent: -1,
        name: "Root",
        color: "black",
        generator: new MGGenerator(),
        children: clusters.map(c => c.id),
        changeUUID: crypto.randomUUID(),
        siblingIndex: 0,
        replication: 1,
        immutable: true
      };
  
      const hRange: [number, number] = [0, 360];
      const cRange: [number, number] = [10 / 100 * 0.4, 45 / 100 * 0.4];
      const lRange: [number, number] = [96, 57];
      const hFrac = 1;
      this.assignColor(root, hRange, cRange, lRange, hFrac, true, false, "fixed");
    }

    public static oklabToLinearSrgb(L: number, a: number, b: number) {
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

    public static getNodeDepths(graph: AdjacencyList): [Node, number][] {
      let depths: [Node, number][] = [];
      for (const node of graph.nodes.keys()) {
        let d = 1;
        let cluster = node.data as Cluster;
        while (cluster.parent != -1) {
          const parent = graph.nodeDictionary.get(cluster.parent)!;
          cluster = parent.data as Cluster;
          d++;
        }
        depths.push([node, d]);
      }
      return depths;
    }

    public static getDepth(graph: AdjacencyList): number {
      let depth = 1;
      for (const [v, d] of this.getNodeDepths(graph)) {
        depth = Math.max(d, depth);
      }
      return depth;
    }

    public static lerp(a: number, b: number, t: number): number {
      return t * (b - a) + a;
    }

    public static lerpP(a: Point, b: Point, t: number): Point {
      return {
        x: t * (b.x - a.x) + a.x,
        y: t * (b.y - a.y) + a.y
       };
    }

    public static scalarMultiplyP(t: number, p: Point): Point {
      return {
        x: t * p.x,
        y: t* p.y
      };
    }

    public static addP(a: Point, b: Point): Point {
      return {
        x: a.x + b.x,
        y: a.y + b.y
      };
    }

    public static subtractP(a: Point, b: Point): Point {
      return {
        x: a.x - b.x,
        y: a.y - b.y
      };
    }

    public static normalizeP(p: Point): Point {
      if (p.x == 0 && p.y == 0) {
        return {
          x: 0,
          y: 0
        };
      }
      const magnitude = Math.sqrt(p.x * p.x + p.y * p.y);
      return {
        x: p.x / magnitude,
        y: p.y / magnitude
      };
    }

    public static scalarP(a: Point, b: Point): number {
      return a.x * b.x + a.y * b.y;
    }

    public static distP(a: Point, b: Point): number {
      return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    }

    public static magintudeP(p: Point): number {
      return Math.sqrt(p.x ** 2 + p.y ** 2);
    }

    public static mod(a: number, b: number): number {
      return ((a % b) + b) % b;
    }
}