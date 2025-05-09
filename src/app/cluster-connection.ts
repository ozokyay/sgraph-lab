import { Series } from "./series";

export interface ClusterConnection {
    edgeCount: number,
    sourceNodeCount: number,
    targetNodeCount: number,
    sourceDegreeDistribution?: Series,
    targetDegreeDistribution?: Series,
    degreeAssortativity: number
}

export const EmptyConnection: ClusterConnection = {
    edgeCount: 0,
    sourceNodeCount: 1,
    targetNodeCount: 1,
    degreeAssortativity: 0
}