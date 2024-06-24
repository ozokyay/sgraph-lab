export class EdgeList {
    public nodes: Node[];
    public edges: Edge[];

    constructor(adjacencyList?: AdjacencyList) {
        if (adjacencyList != undefined) {
            this.nodes = [...adjacencyList.nodes.keys()];
            this.edges = [];
            const edgeSet = new Set<number>();
            for (const [source, targets] of adjacencyList.nodes) {
                for (const target of targets) {
                    const e1 = source.id | (target[1].id << 16);
                    const e2 = target[1].id | (source.id << 16);
                    if (!edgeSet.has(e1) && !edgeSet.has(e2)) {
                        edgeSet.add(e1);
                        this.edges.push(target[0]);
                    }
                }
            }
        } else {
            this.nodes = [];
            this.edges = [];
        }
    }

    public static fromNetworkX(nodes: Node[], edges: { source: number, target: number }[] ): EdgeList {
        return {
            nodes: nodes,
            edges: edges.map(e => { return { source: nodes[e.source], target: nodes[e.target] }; })
        }
    }
}

export class AdjacencyList {
    public nodes: Map<Node, [Edge, Node][]>;
    public nodeDictionary: Map<number, Node>; // Kinda bad for performance I guess
    public edgeDictionary: Map<number, Edge>;

    constructor (edgeList?: EdgeList) {
        this.nodes = new Map();
        this.nodeDictionary = new Map();
        this.edgeDictionary = new Map();
        if (edgeList != undefined) {
            for (const node of edgeList.nodes) {
                this.nodes.set(node, []);
            }
            for (const edge of edgeList.edges) {
                this.nodes.get(edge.source)!.push([edge, edge.target]);
                this.nodes.get(edge.target)!.push([edge, edge.source]);
            }
        }
    }

    public getNodes(): Node[] {
        return [...this.nodes.keys()];
    }

    public addEdge(edge: Edge) {
        this.nodes.get(edge.source)!.push([edge, edge.target]);
        this.nodes.get(edge.target)!.push([edge, edge.source]);
    }

    public removeEdge(edge: Edge) {
        const node1 = this.nodes.get(edge.source)!;
        const node2 = this.nodes.get(edge.target)!;
        node1.splice(node1.findIndex(v => v[0] === edge), 1);
        node2.splice(node2.findIndex(v => v[0] === edge), 1);
    }

    public addNode(node: Node) {
        this.nodes.set(node, []);
    }

    public removeNode(node: Node) {
        this.nodes.delete(node);
    }

    public clear() {
        this.nodes.clear();
    }
}

export interface Node {
    id: number,
    data?: any
}

export interface Edge {
    source: Node,
    target: Node,
    data?: any
}

// Decisions:
// - Where to store node/edge attributes
// - Mapping edges to node indices or ids
// - nodes as list/array/map (id -> node)
// - if edges are only numbers, then nodes must be stored in a map
// - Dictionary has the advantage of not having to mantain nodes when switching representations