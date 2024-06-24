import { Series } from "./series";

export interface ClusterConnection {
    nodeCount1: number,
    nodeCount2: number,
    edgeCount: number,
    degreeDistribution1: Series,
    degreeDistribution2: Series,
    degreeAssortativity: number
}