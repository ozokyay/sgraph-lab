import { Series } from "./series";

export interface ClusterConnection {
    nodeCountSource: number,
    nodeCountTarget: number,
    edgeCount: number,
    degreeDistributionSource?: Series,
    degreeDistributionTarget?: Series,
    degreeAssortativity: number
}