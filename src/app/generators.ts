import { AdjacencyList, Edge, EdgeList } from "./graph";
import { LocalService } from "./local.service";
import { Series } from "./series";
import { Utility } from "./utility";

export interface Generator {
    name: string,
    generate: () => EdgeList
}

export class ERGenerator implements Generator {
    public name = "ER";
    public nodeCount: number;
    public edgeCount: number;
    public extractGiantComponent: boolean;

    // It's probably a good idea to force the caller to provide reasonable initialization
    constructor(nodeCount: number, edgeCount: number, extractGiantComponent: boolean) {
        this.nodeCount = nodeCount;
        this.edgeCount = edgeCount;
        this.extractGiantComponent = extractGiantComponent;
    }

    public generate(): EdgeList {
        // Run generator
        let g = LocalService.generateErdosRenyi(this.nodeCount, this.edgeCount);
        console.log(g);
        if (this.extractGiantComponent) {
            g = LocalService.extractGiantComponent(new AdjacencyList(g));
        }

        return g;
    }
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

        // Extra assortativity edges

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

        // Extra assortativity edges

        return g;
    }
}

// Manual Group
export class MGGenerator implements Generator {
    public name = "MG";
    public group = "group";

    public generate(): EdgeList {
        return { nodes: [], edges: [] };
    }
}

// Automatic Group
export class AGGenerator implements Generator {
    public name = "AG";
    public group = "group";
    public numGroups: number;

    constructor(numGroups: number = 2) {
        this.numGroups = numGroups;
    }

    public generate(): EdgeList {
        return { nodes: [], edges: [] };
    }
}