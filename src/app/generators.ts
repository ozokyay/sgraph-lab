import { AdjacencyList, EdgeList } from "./graph";
import { LocalService } from "./local.service";
import { Series } from "./series";
import { Utility } from "./utility";

export interface Generator {
    name: string,
    generate: () => EdgeList
}

export class CLGenerator implements Generator {
    public name = "CL";
    public degreeDistribution: Series;
    public extractGiantComponent: boolean;

    // It's probably a good idea to force the caller to provide reasonable initialization
    constructor(degreeDistribution: Series, extractGiantComponent: boolean) {
        this.degreeDistribution = degreeDistribution;
        this.extractGiantComponent = extractGiantComponent;
    }

    public generate(): EdgeList {
        // Convert series to distribution
        const distribution = Utility.computeDistribution(this.degreeDistribution);
        // Convert to node by deg format
        let sum = 0;
        let nodeDegrees: number[] = [];
        for (const p of distribution) {
            if (p.x == 0) {
                continue;
            }
            for (let i = 0; i < p.y; i++) {
                const deg = p.x;
                nodeDegrees.push(deg);
                sum += deg;
            }
        }
        // Run generator
        let g = LocalService.generateChungLu(nodeDegrees);
        if (this.extractGiantComponent) {
            g = LocalService.extractGiantComponent(new AdjacencyList(g));
        }
        return g;
    }
}

export class CMGenerator implements Generator {
    public name = "CM";
    public degreeDistribution: Series;
    public extractGiantComponent: boolean;

    constructor(degreeDistribution: Series, extractGiantComponent: boolean) {
        this.degreeDistribution = degreeDistribution;
        this.extractGiantComponent = extractGiantComponent;
    }

    public generate(): EdgeList {
        // Convert series to distribution
        const distribution = Utility.computeDistribution(this.degreeDistribution);
        // Convert to node by deg format
        let sum = 0;
        let nodeDegrees: number[] = [];
        for (const p of distribution) {
            if (p.x == 0) {
                continue;
            }
            for (let i = 0; i < p.y; i++) {
                const deg = Math.round(p.x);
                nodeDegrees.push(deg);
                sum += deg;
            }
        }
        // Ensure even node count
        if (sum % 2 != 0) {
            nodeDegrees.push(1);
        }
        // Run generator
        let g = LocalService.generateConfigurationModel(nodeDegrees);
        if (this.extractGiantComponent) {
            g = LocalService.extractGiantComponent(new AdjacencyList(g));
        }
        return g;
    }
}