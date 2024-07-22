import { Generator } from "./generators"

export interface Cluster {
    id: number,
    name: string,
    color: number,
    children: Cluster[],
    generator: Generator
}
