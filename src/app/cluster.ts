import { Series } from "./series";

export interface Cluster {
    generator: "CL" | "CM",
    degreeDistribution: Series,
    extractGiantComponent: boolean,
    color: number
}