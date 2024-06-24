import { Cluster } from "./cluster";
import { ClusterConnection } from "./cluster-connection";
import { AdjacencyList, Edge, EdgeList } from "./graph";
import { Series } from "./series";

export interface GraphConfiguration {
    defintion: GraphDefintion,
    instance: GraphInstance,
    message: string
}

export interface GraphDefintion {
    graph: AdjacencyList,
    seed: number
}

export interface GraphInstance {
    clusters: Map<Cluster, EdgeList>,
    connections: Map<ClusterConnection, Edge[]>,
    graph: EdgeList,
    clusterMeasures: Map<Cluster, GraphMeasures>,
    globalMeasures: GraphMeasures
}

export interface GraphMeasures {
    nodeCount: number,
    edgeCount: number,
    degreeDistribution: Series
}

export const EmptyMeasures: GraphMeasures = {
    nodeCount: 0,
    edgeCount: 0,
    degreeDistribution: { data: [], xExtent: [0, 0], yExtent: [0, 0] }
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