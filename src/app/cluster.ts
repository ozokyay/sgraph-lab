import { Generator } from "./generators"

export interface Cluster {
    id: number,
    name: string,
    color: string,
    parent: number,
    children: number[],
    generator: Generator,
    changeUUID: string
}
