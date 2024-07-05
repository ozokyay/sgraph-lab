import { EdgeList, Edge, Node, AdjacencyList } from "./graph";
import { Point } from "./point";
import { Series } from "./series";
import Rand from 'rand-seed';
import * as d3 from 'd3';

export class Utility {
    public static rand = new Rand('default');

    // https://stackoverflow.com/questions/29085197/how-do-you-json-stringify-an-es6-map
    private static replacer(key: string, value: any) {
      if(value instanceof Map) {
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
        const nodes: Node[] = [];
        const edges: Edge[] = [];
        const allEdges = [...input.edges];
    
        // Random edge sampling
        Utility.shuffleArray(allEdges);
        const sample = allEdges.slice(0, edgeCount)
        for (const e of sample) {
          const edge = e;
          nodes.push(edge.source, edge.target);
          edges.push(e);
        }
        // Induced subgraph
        // for (const e of allEdges) {
        //   if (!edges.has(e) && nodes.has(e.sourceNode) && nodes.has(e.targetNode)) {
        //     edges.add(e);
        //   }
        // }
        return { nodes: nodes, edges: sample };
    }

    public static addDistributions(d1: Series, d2: Series): Series {
      const data: Point[] = [];
      // Assuming there are no gaps
      for (let i = 0; i < Math.min(d1.data.length, d2.data.length); i++) {
        data.push({
          x: d1.data[i].x,
          y: d1.data[i].y + d2.data[i].y
        });
      }
      if (d1.data.length < d2.data.length) {
        data.push(...this.deepCopyPoints(d2.data.slice(d1.data.length, d2.data.length)));
      } else if (d1.data.length > d2.data.length) {
        data.push(...this.deepCopyPoints(d1.data.slice(d2.data.length, d1.data.length)));
      }
      return {
        data: data,
        xExtent: [Math.min(d1.xExtent[0], d2.xExtent[0]), Math.max(d1.xExtent[1], d2.xExtent[1])],
        yExtent: [Math.min(d1.yExtent[0], d2.yExtent[0]), Math.max(d1.yExtent[1], d2.yExtent[1])]
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

    public static sortNodeDegrees(degrees: Map<Node, number>): Map<number, Node[]> {
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
      const degreeBuckets = Utility.sortNodeDegrees(degrees);
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

    public static arraysEqual(a: any[], b: any[]): boolean {
      if (a.length != b.length) {
        return false;
      }
      for (let i = 0; i < a.length; i++) {
        if (a[i] != b[i]) {
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
}