export interface LayoutSettings {
    sampling: number,
    gravity: number
}

export interface GraphicsSettings {
    nodeColoring: boolean,
    edgeColoring: boolean,
    nodeRadius: boolean
}

export const DefaultLayout: LayoutSettings = {
    sampling: 1,
    gravity: 1
}

export const DefaultGraphics: GraphicsSettings = {
    nodeColoring: true,
    edgeColoring: true,
    nodeRadius: false
}