export interface LayoutSettings {
    sampling: number,
    gravity: number,
    iterations: number
}

export interface GraphicsSettings {
    nodeColoring: boolean,
    edgeColoring: boolean,
    nodeRadius: boolean,
    clusterLevel: boolean
}

export const DefaultLayout: LayoutSettings = {
    sampling: 1,
    gravity: 1,
    iterations: 100
}

export const DefaultGraphics: GraphicsSettings = {
    nodeColoring: true,
    edgeColoring: true,
    nodeRadius: false,
    clusterLevel: false
}