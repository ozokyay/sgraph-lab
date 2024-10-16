import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { VisLineChartComponent } from '../vis-line-chart/vis-line-chart.component';
import { FormsModule } from '@angular/forms';
import { GraphMeasures } from '../graph-configuration';
import { ConfigurationService } from '../configuration.service';
import { Cluster } from '../cluster';
import { CLGenerator, CMGenerator, MGGenerator } from '../generators';
import { DegreesDefault, Series } from '../series';
import { Utility } from '../utility';
import { MatDividerModule } from '@angular/material/divider';

@Component({
  selector: 'app-tab-cluster',
  standalone: true,
  imports: [
    MatInputModule,
    MatFormFieldModule,
    MatSlideToggleModule,
    MatSelectModule,
    VisLineChartComponent,
    FormsModule
  ],
  templateUrl: './tab-cluster.component.html',
  styleUrl: './tab-cluster.component.css'
})
export class TabClusterComponent {

  public clusterMeasures?: GraphMeasures;
  public measuredDistribution?: Series;
  public cluster?: Cluster = undefined;
  public generator?: any = undefined; // To erase type for html
  public theoreticalNodeCount = 0;

  constructor(private config: ConfigurationService) {
    Utility.config = config;
    config.measures.subscribe(measures => {
      if (this.cluster != undefined) {
        this.clusterMeasures = measures.clusterMeasures.get(this.cluster!.id)
        this.measuredDistribution = this.computeMeasuredDistribution();
        this.theoreticalNodeCount = this.computeTheoreticalNodeCount();
      }
    });
    config.configuration.subscribe(config => {
      if (this.cluster != undefined) {
        this.clusterMeasures = config.instance.clusterMeasures.get(this.cluster!.id)
        this.measuredDistribution = this.computeMeasuredDistribution();
        this.theoreticalNodeCount = this.computeTheoreticalNodeCount();
      }
    });
    config.selectedCluster.subscribe(cluster => {
      this.cluster = cluster;
      if (this.cluster != undefined) {
        this.generator = this.cluster.generator;
        this.clusterMeasures = config.measures.value.clusterMeasures.get(this.cluster.id);
        this.measuredDistribution = this.computeMeasuredDistribution();
        this.theoreticalNodeCount = this.computeTheoreticalNodeCount();
      }
    });
  }

  private computeMeasuredDistribution(): Series | undefined {
    if (this.cluster != undefined && this.cluster.children.length > 0 && this.cluster.generator.name != "MG") {
      return Utility.averageDistributions(this.cluster.children.map(c => this.config.measures.value.clusterMeasures.get(c)!.degreeDistribution));
    } else {
      return this.clusterMeasures?.degreeDistribution;
    }
  }

  private computeTheoreticalNodeCount(): number {
    if (this.cluster?.generator?.name != "CL" && this.cluster?.generator?.name != "CM") {
      return 0;
    }
    const gen: CLGenerator | CMGenerator = this.cluster?.generator as CLGenerator | CMGenerator;
    let total = 0;
    for (const p of gen.degreeDistribution.data) {
      total += p.y;
    }
    return Math.round(total);
  }

  public onChangeGenerator(generator: string) {
    const oldGenerator = this.cluster!.generator as any;
    let degreeDistribution: Series = oldGenerator.degreeDistribution || DegreesDefault;
    let extractGiantComponent: boolean = oldGenerator.extractGiantComponent || true;
    switch (generator) {
      case "CL":
        this.cluster!.generator = new CLGenerator(degreeDistribution, extractGiantComponent);
        break;
      case "CM":
        this.cluster!.generator = new CMGenerator(degreeDistribution, extractGiantComponent);
        break;
      case "MG":
        this.cluster!.generator = new MGGenerator();
        this.cluster!.replication = 1;
        for (const child of this.cluster!.children) {
          const node = this.config.configuration.value.definition.graph.nodeDictionary.get(child);
          const cluster = node?.data as Cluster;
          cluster.immutable = false;
        }
        break;
    }
    this.generator = this.cluster!.generator;
    this.onChange();
  }

  public onChange() {
    if (this.cluster != undefined) {
      this.updateReplication();
      this.cluster.changeUUID = crypto.randomUUID();
      this.config.update("Change cluster " + this.cluster.id);
    }
  }

  public onChangeName() {
    if (this.cluster != undefined) {
      if (this.config.configuration.value.definition.graph.getNodes()
          .map(v => v.data as Cluster)
          .find(c => c != this.cluster && c.name == this.cluster?.name)) {
          this.cluster.name += "~1";
      }
      this.config.trackHistory("Rename cluster " + this.cluster.id);
    }
  }

  private updateReplication() {
    if (this.cluster == undefined) {
      return;
    }

    if (this.generator.name != "MG" && this.cluster.children.length != this.cluster.replication) {
      // Kill all children
      for (const child of this.cluster.children) {
        const node = this.config.configuration.value.definition.graph.nodeDictionary.get(child)!;
        this.config.configuration.value.definition.graph.removeNode(node);
      }
      this.cluster.children = [];
      const children: number[] = [];

      // Done if replication was reset
      if (this.cluster.replication == 1) {
        // Update colors
        const topLevel = this.config.configuration.value.definition.graph.getNodes().map(n => n.data as Cluster).filter(c => c.parent == -1);
        Utility.updateColors(topLevel);
        return;
      }

      // Get next ID
      let id = 0;
      if (this.config.configuration.value.definition.graph.nodeDictionary.size > 0) {
        const nodes = [...this.config.configuration.value.definition.graph.nodeDictionary.values()]
        const latestNode = nodes[nodes.length - 1];
        const latestCluster = latestNode.data as Cluster;
        id = latestCluster.id + 1;
      }

      // Clone
      for (let i = 0; i < this.cluster.replication; i++) {
        const newChild = structuredClone(this.cluster);
        switch (newChild.generator.name) {
          case "CL":
            const cl = newChild.generator as CLGenerator;
            newChild.generator = new CLGenerator(cl.degreeDistribution, cl.extractGiantComponent);
            break;
          case "CM":
            const cm = newChild.generator as CMGenerator;
            newChild.generator = new CMGenerator(cm.degreeDistribution, cm.extractGiantComponent);
            break;
        }
        newChild.replication = 1;
        newChild.immutable = true;
        newChild.id = id;
        newChild.siblingIndex = i;
        newChild.parent = this.cluster.id;
        newChild.name = this.cluster.name + "." + (i + 1);
        children.push(newChild.id);
        newChild.changeUUID = crypto.randomUUID();
        this.config.configuration.value.definition.graph.addNode({ id: newChild.id, data: newChild });
        id++;
      }
      this.cluster.children = children;
      
      // Update colors
      const topLevel = this.config.configuration.value.definition.graph.getNodes().map(n => n.data as Cluster).filter(c => c.parent == -1);
      Utility.updateColors(topLevel);
    }

    if (this.cluster.replication > 1) {
      // Update existing generators
      for (const child of this.cluster.children) {
        const node = this.config.configuration.value.definition.graph.nodeDictionary.get(child);
        const cluster = node?.data as Cluster;
        switch (this.cluster.generator.name) {
          case "CL":
            const cl = this.cluster.generator as CLGenerator;
            cluster.generator = new CLGenerator(structuredClone(cl.degreeDistribution), cl.extractGiantComponent);
            break;
          case "CM":
            const cm = this.cluster.generator as CMGenerator;
            cluster.generator = new CMGenerator(structuredClone(cm.degreeDistribution), cm.extractGiantComponent);
            break;
        }
        cluster.changeUUID = crypto.randomUUID();
      }
    }

    // Allow replication on other levels to replicate subtrees? Not possible because replication is set together with curve, no mechanism to extend replication to subtrees (and no likely need to do so)
    // KISS
  }

  public onChangeNodeCount(t: any) {
    const nodeCount = t.value as number;
    const gen: CLGenerator | CMGenerator = this.cluster?.generator as CLGenerator | CMGenerator;
    let total = 0;
    for (const p of gen.degreeDistribution.data) {
      total += p.y;
    }
    Utility.multiplyDistribution(gen.degreeDistribution, 1 / total);
    Utility.multiplyDistribution(gen.degreeDistribution, nodeCount);
    const max = gen.degreeDistribution.data.reduce((a, b) => Math.max(a, Math.ceil(b.y)), 0);
    gen.degreeDistribution.yExtent[1] = max;
    this.onChange();
  }
}
