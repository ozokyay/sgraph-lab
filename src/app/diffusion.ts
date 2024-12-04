import { AdjacencyList, Node } from "./graph";

export type NodeState = "susceptible" | "contacted" | "infected" | "refractory";

export interface DiffusionModel {
    nodeState: Map<Node, NodeState>,
    tick(): boolean
}

export class SI implements DiffusionModel {
    public nodeState: Map<Node, NodeState> = new Map();
    public infectionProbability;

    private graph: AdjacencyList;

    constructor(graph: AdjacencyList, nodeState: Map<Node, NodeState>, infectionProbability: number) {
        this.graph = graph;
        this.nodeState = nodeState;
        this.infectionProbability = infectionProbability;
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

// export class SIR implements DiffusionModel{ // Can justify constant probability -> exp/geom distributio -> cdf time for some models

// }

// export class SIS implements DiffusionModel {

// }

// SIRS

export class SCIR implements DiffusionModel {
    public nodeState: Map<Node, NodeState> = new Map();
    public infectionProbability = 0.3;
    public refractoryProbability = 0.5;
    public contactedOrRefractoryNodes = 0;

    private graph: AdjacencyList;

    constructor(graph: AdjacencyList, nodeState: Map<Node, NodeState>, infectionProbability: number, refractoryProbability: number) {
        this.graph = graph;
        this.nodeState = nodeState;
        this.infectionProbability = infectionProbability;
        this.refractoryProbability = refractoryProbability;
    }

    public tick(): boolean {
        let done = true;
        for (const [node, state] of this.nodeState) {
            if (state == "infected") {
                for (const [e, m] of this.graph!.nodes.get(node)!) {
                    if (this.nodeState.get(m) == "susceptible" || this.nodeState.get(m) == "contacted") {
                        done = false;
                        break;
                    }
                }
            } else if (state == "contacted") {
                done = false;
                break;
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