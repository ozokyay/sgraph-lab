import { Series } from "./series";

export interface Cluster {
    id: number,
    generator: "CL" | "CM",
    degreeDistribution: Series,
    extractGiantComponent: boolean,
    color: number,
    name: string
}