import { Component } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { VisLineChartComponent } from '../vis-line-chart/vis-line-chart.component';
import { MatIconModule } from '@angular/material/icon';
import { ConfigurationService } from '../configuration.service';
import { FormsModule } from '@angular/forms';
import { EmptySeries, Series } from '../series';
import { AdjacencyList, Node } from '../graph';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { TutorialService } from '../tutorial.service';
import { Cluster } from '../cluster';
import { DiffusionModel, NodeState, SCIR, SI } from '../diffusion';

@Component({
  selector: 'app-tab-information-diffusion',
  standalone: true,
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSliderModule,
    MatButtonModule,
    MatIconModule,
    FormsModule,
    VisLineChartComponent
  ],
  templateUrl: './tab-information-diffusion.component.html',
  styleUrl: './tab-information-diffusion.component.css'
})
export class TabInformationDiffusionComponent {
  public diffusionModel: "SI" | "SCIR" = "SI";
  public infectionProbability = 0.1;
  public refractoryProbability = 0.5;

  public simulationSpeed = 10;
  public totalActive: Series = EmptySeries();
  public stepActive: Series = EmptySeries();
  public clusterActive: Map<number, [Series, string]> = new Map();
  public clusters: [string, number][] = [];

  public seedNodes: Node[] = [];

  public contactedOrRefractoryNodes = 0;
  public step = 0;
  public running = false;
  public dirty = false;

  private graph?: AdjacencyList;
  private originalSeedNodes: Set<Node> = new Set();
  private model?: DiffusionModel;
  private intervalID = 0;

  constructor(private config: ConfigurationService, private tutorial: TutorialService) {
    config.configuration.subscribe(configuration => {
      this.graph = new AdjacencyList(configuration.instance.graph);
      this.seedNodes = [];
      this.originalSeedNodes.clear();
      this.onPause();
      this.onReset(true);
    });
    config.selectedDiffusionSeeds.subscribe(seeds => {
      this.seedNodes = [...seeds];
    });
    tutorial.playDiffusion.subscribe(() => {
      this.onPlay();
    });
    tutorial.stopDiffusion.subscribe(() => {
      this.seedNodes = [];
      this.originalSeedNodes.clear();
      this.onPause();
      this.onReset(true);
    });
  }

  public onPlay() {
    if (!this.dirty) {
      this.originalSeedNodes = new Set(this.seedNodes);

      switch (this.diffusionModel) {
        case 'SI':
          this.model = new SI(this.graph!, this.seedNodes);
          break;
        case 'SCIR':
          this.model = new SCIR(this.graph!, this.seedNodes);
          break;
      }

      const entries = this.config.configuration.value.definition.graph.getNodes().map(n => [n.id, [{ data: [], xExtent: [0, 10], yExtent: [0, this.graph!.nodes.size] }, (n.data as Cluster).color]] as [number, [Series, string]]);
      this.clusterActive = new Map(entries);
    }
    this.dirty = true;
    this.running = true;

    this.intervalID = setInterval(() => this.onTick(), 1000 / this.simulationSpeed);
  }

  public onPause() {
    clearInterval(this.intervalID);
    this.running = false;
  }

  public onReset(noSeedEvent: boolean = false) {
    // Clear all node/edge highlights
    this.step = 0;
    this.dirty = false;
    this.seedNodes = [...this.originalSeedNodes];
    this.contactedOrRefractoryNodes = 0;

    // TODO: Not much to do, will just ignore old model
    // publish new (reset) values to config

    // Reset series
    this.totalActive = { data: [], xExtent: [0, 10], yExtent: [0, this.graph!.nodes.size] };
    this.stepActive = { data: [], xExtent: [0, 10], yExtent: [0, this.graph!.nodes.size] };
    this.clusterActive = new Map();
    this.clusters = [];

    // Prevent event chaining
    if (!noSeedEvent) {
      // Render
      this.config.selectedDiffusionSeeds.next(this.seedNodes);
      this.config.diffusionNodeStates.next(this.nodeState);
    }
  }

  public onClear() {
    // TODO: Must clear model

    this.seedNodes = [];
    this.originalSeedNodes.clear();
    // Render
    this.config.selectedDiffusionSeeds.next(this.seedNodes);
  }

  private onTick() {
    // Tick
    if (!this.model!.tick()) {
      this.onPause();
      return;
    }

    // Calculate per cluster
    this.clusters = [];
    for (const [id, graph] of this.config.configuration.value.instance.clusters.entries()) {
      const cluster = this.config.configuration.value.definition.graph.nodeDictionary.get(id)!.data as Cluster;
      if (cluster.parent == -1) {
        const [series, _] = this.clusterActive.get(cluster.id)!;
        let count = 0;
        for (const n of graph.nodes) {
          if (this.model!.nodeState.get(n) == "infected") {
            count++;
          }
        }
        series.data.push({
          x: this.step,
          y: count
        });
        if (series.xExtent[1] <= this.step) {
          series.xExtent[1] = Math.round(1.5 * series.xExtent[1]);
        }
        this.clusters.push([cluster.name, count]);
        // Just rely on updates from total active
      }
    }

    // Update series (extent in steps +1/3 free)
    this.totalActive.data.push({
      x: this.step,
      y: this.seedNodes.size
    });
    this.stepActive.data.push({
      x: this.step,
      y: toAdd.size
    });
    if (this.totalActive.xExtent[1] <= this.step) {
      this.totalActive.xExtent[1] = Math.round(1.5 * this.totalActive.xExtent[1]);
      this.stepActive.xExtent[1] = Math.round(1.5 * this.stepActive.xExtent[1]);
    }

    this.totalActive = {...this.totalActive};
    this.stepActive = {...this.stepActive};
    this.step++;

    // Render
    this.config.selectedDiffusionSeeds.next(this.seedNodes);
    this.config.diffusionNodeStates.next(this.model!.nodeState);
  }
}
