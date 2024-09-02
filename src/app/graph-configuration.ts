import { Cluster } from "./cluster";
import { ClusterConnection } from "./cluster-connection";
import { AdjacencyList, Node, Edge, EdgeList } from "./graph";
import { Series } from "./series";

export interface GraphConfiguration {
    definition: GraphDefintion,
    instance: GraphInstance,
    message: string
}

export interface GraphDefintion {
    graph: AdjacencyList,
    seed: number
}

export interface GraphInstance {
    clusters: Map<number, EdgeList>,
    connections: Map<Edge, Edge[]>,
    graph: EdgeList,
    clusterMeasures: Map<number, GraphMeasures>,
    globalMeasures: GraphMeasures
}

export interface GraphMeasures {
    nodeCount: number,
    edgeCount: number,
    density: number,
    degrees: Map<Node, number>,
    degreeDistribution: Series,
    clusteringCoefficientDistribution: Series,
    clusteringCoefficientDistribution2: Series,
    diameter: number,
    eigenvectorCentralityDistribution: Series,
    degreeAssortativity: number
    
}

export const EmptyMeasures: GraphMeasures = {
    nodeCount: 0,
    edgeCount: 0,
    density: 0,
    degrees: new Map(),
    degreeDistribution: { data: [], xExtent: [0, 0], yExtent: [0, 0] },
    clusteringCoefficientDistribution: { data: [], xExtent: [0, 0], yExtent: [0, 0] },
    clusteringCoefficientDistribution2: { data: [], xExtent: [0, 0], yExtent: [0, 0] },
    diameter: 0,
    eigenvectorCentralityDistribution: { data: [], xExtent: [0, 0], yExtent: [0, 0] },
    degreeAssortativity: 0
}

export const EmptyDefinition: GraphDefintion = {
    graph: new AdjacencyList(),
    seed: 42
}

export const EmptyInstance: GraphInstance = {
    clusters: new Map(),
    connections: new Map(),
    graph: new EdgeList(),
    clusterMeasures: new Map(),
    globalMeasures: EmptyMeasures
}