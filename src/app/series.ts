import { Point } from './point'

export interface Series {
    data: Point[],
    xExtent: number[],
    yExtent: number[]
}

export const EmptySeries = (): Series => ({
    data: [],
    xExtent: [0, 0],
    yExtent: [0, 0]
});

export const Uniform10: Series = {
    data: [
        { x: 1, y: 0.5 },
        { x: 10, y: 0.5 }
    ],
    xExtent: [1, 10],
    yExtent: [0, 1]
}

export const DegreesDefault: Series = {
    data: [
      { x: 1, y: 50 },
      { x: 2, y: 25 },
      { x: 3, y: 16.7 },
      { x: 4, y: 12.5 },
      { x: 5, y: 10 },
      { x: 6, y: 8.3 },
      { x: 7, y: 7.1 },
      { x: 8, y: 6.3 },
      { x: 9, y: 5.5 },
      { x: 10, y: 5 },
    ],
    xExtent: [1, 10],
    yExtent: [0, 50]
}