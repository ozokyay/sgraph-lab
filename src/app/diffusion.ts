import { AdjacencyList, Node } from "./graph";

export type NodeState = "susceptible" | "contacted" | "infected" | "refractory";

export interface DiffusionModel {
    nodeState: Map<Node, NodeState>,
    tick(): boolean
}

export class SI implements DiffusionModel {
    public nodeState: Map<Node, NodeState> = new Map();
    public infectionProbability = 0.1;

    private graph: AdjacencyList;

    constructor(graph: AdjacencyList, seeds: Node[]) {
        this.graph = graph;
        for (const n of this.graph!.nodes.keys()) {
            this.nodeState.set(n, "susceptible");
        }
        for (const n of seeds) {
            this.nodeState.set(n, "infected");
        }
    }

    public tick(): boolean {
        let done = true;
        for (const [node, state] of this.nodeState) {
            if (state == "infected" && this.infectionProbability > 0) {
                for (const [e, m] of this.graph!.nodes.get(node)!) {
                    if (this.nodeState.get(m) == "susceptible") {
                        done = false;
                        break;
                    }
                }
            }
        }
        if (done) {
            return false;
        }

        const toAdd: Node[] = [];
        for (const [node, state] of this.nodeState) {
            if (state == "infected") {
                const neighbors = this.graph.nodes.get(node)!;
                for (const [e, n] of neighbors) {
                    if (this.nodeState.get(n) == "susceptible" && Math.random() < this.infectionProbability) {
                        toAdd.push(n);
                    }
                }
            }
        }

        for (const node of toAdd) {
            this.nodeState.set(node, "infected");
        }

        return true;
    }
}

// export class SIR implements DiffusionModel{

// }

// export class SIS implements DiffusionModel {

// }

export class SCIR implements DiffusionModel {
    public nodeState: Map<Node, NodeState> = new Map();
    public infectionProbability = 0.3;
    public refractoryProbability = 0.5;
    public contactedOrRefractoryNodes = 0;

    private graph: AdjacencyList;

    constructor(graph: AdjacencyList, seeds: Node[]) {
        this.graph = graph;
        for (const n of this.graph!.nodes.keys()) {
            this.nodeState.set(n, "susceptible");
        }
        for (const n of seeds) {
            this.nodeState.set(n, "infected");
        }
    }

    public tick(): boolean {
        let done = true;
        for (const [node, state] of this.nodeState) {
            for (const [e, m] of this.graph!.nodes.get(node)!) {
                if (this.nodeState.get(m) == "susceptible" || this.nodeState.get(m) == "contacted") {
                    done = false;
                    break;
                }
            }
        }
        if (done) {
            return false;
        }

        const oldStates = new Map<Node, NodeState>(this.nodeState);
        for (const node of this.graph!.nodes.keys()) {
          const state = oldStates.get(node)!;
          if (state == "susceptible") {
            const neighbors = this.graph!.nodes.get(node)!;
            for (const [e, n] of neighbors) {
              const neighborState = oldStates.get(n)!;
              if (neighborState == "infected") {
                if (Math.random() < this.infectionProbability) {
                  this.nodeState.set(node, "infected");
                } else {
                  this.nodeState.set(node, "contacted");
                  this.contactedOrRefractoryNodes++;
                }
                break;
              }
            }
          } else if (state == "contacted") {
            if (Math.random() < this.refractoryProbability) {
              this.nodeState.set(node, "refractory");
            } else if (Math.random() < this.infectionProbability) {
              this.nodeState.set(node, "infected");
              this.contactedOrRefractoryNodes--;
            }
          }
        }

        return true;
    }
}