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
import { DiffusionModel, NodeState, SCIR, SI, SIR, SIRS, SIS } from '../diffusion';

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
  public diffusionModel: "SI" | "SIR" | "SIS" | "SIRS" | "SCIR" = "SI";
  public infectionProbability = 0.1;
  public refractoryProbability = 0.1;
  public susceptibleProbability = 0.1;

  public simulationSpeed = 10;
  public totalActive: Series = EmptySeries();
  public clusterActive: Map<number, [Series, string]> = new Map();
  public clusters: [string, number][] = [];

  public infectedNodes = 0;
  public reachedNodes = 0;
  public step = 0;
  public running = false;
  public dirty = false;

  private graph?: AdjacencyList;
  private originalNodeStates: Map<Node, NodeState> = new Map();
  private model?: DiffusionModel;
  private intervalID = 0;

  constructor(private config: ConfigurationService, private tutorial: TutorialService) {
    config.configuration.subscribe(configuration => {
      this.graph = new AdjacencyList(configuration.instance.graph);
      this.originalNodeStates.clear();
      this.onPause();
      this.onReset(true);
      // Might want to keep seeds in the future, but clear on changes for now
      // Cannot clear because of inconsistent graph across tabs
      // for (const n of this.graph!.nodes.keys()) {
      //   this.originalNodeStates.set(n, "susceptible"); // Graph/state mismatch? -> Should clear diffusionNodeStates and publish to config? otherwise original will only get old again, full of old node states (susc)
      // }
      // this.infectedNodes = 0;

      // But onclear breaks stuff due to graph mismatch across tabs
      // Alternative coul be caching nodeStates here (but adds complexity)
      
      // Only issue are deleted clusters -> handle this case?

      let prev = this.config.ignoreChanges;
      this.config.ignoreChanges = true;
      this.onClear(); // Causes NL to access old graph, fails to lookup old (removed) cluster id on new graph
      // But must update config.diffNodes, otherwise user is editing outdated map
      this.config.ignoreChanges = prev;
    });
    config.diffusionNodeStates.subscribe(states => {
      if (!this.running) {
        this.infectedNodes = 0;
        // Count
        for (const [node, state] of states) {
          if (state == "infected") {
            this.infectedNodes++;
          }
          if (this.dirty && state != "susceptible") {
            this.model!.reachedNodes.add(node);
          }
        }
        this.reachedNodes = this.dirty ? this.model!.reachedNodes.size : this.infectedNodes;
      }
    });
    tutorial.playDiffusion.subscribe(() => {
      this.onPlay();
    });
    tutorial.stopDiffusion.subscribe(() => {
      this.onPause();
      this.onReset(true);
      // Cannot clear because of inconsistent graph across tabs
      // for (const n of this.graph!.nodes.keys()) {
      //   this.originalNodeStates.set(n, "susceptible");
      // }
      // this.infectedNodes = 0;

      let prev = this.config.ignoreChanges;
      this.config.ignoreChanges = true;
      this.onClear();
      this.config.ignoreChanges = prev;
    });
  }

  public onPlay() {
    if (!this.dirty) {
      this.originalNodeStates = new Map(this.config.diffusionNodeStates.value);

      switch (this.diffusionModel) {
        case 'SI':
          this.model = new SI(this.graph!, this.config.diffusionNodeStates.value, this.infectionProbability);
          break;
        case 'SIR':
          this.model = new SIR(this.graph!, this.config.diffusionNodeStates.value, this.infectionProbability, this.refractoryProbability);
          break;
        case 'SIS':
          this.model = new SIS(this.graph!, this.config.diffusionNodeStates.value, this.infectionProbability, this.susceptibleProbability);
          break;
        case 'SIRS':
          this.model = new SIRS(this.graph!, this.config.diffusionNodeStates.value, this.infectionProbability, this.refractoryProbability, this.susceptibleProbability);
          break;            
        case 'SCIR':
          this.model = new SCIR(this.graph!, this.config.diffusionNodeStates.value, this.infectionProbability, this.refractoryProbability);
          break;
      }

      // Not dirty, so currrently no uninfected reached
      // Must add all infected as reached
      for (const [node, state] of this.model.nodeState) {
        if (state == "infected") {
          this.model.reachedNodes.add(node);
        }
      }

      const entries = this.config.configuration.value.definition.graph.getNodes().map(n => [n.id, [{ data: [], xExtent: [0, 10], yExtent: [0, this.graph!.nodes.size] }, (n.data as Cluster).color]] as [number, [Series, string]]);
      this.clusterActive = new Map(entries);
    } else {
      switch (this.diffusionModel) {
        case 'SI':
          (this.model as SI).infectionProbability = this.infectionProbability;
          break;
        case 'SIR':
          (this.model as SIR).infectionProbability = this.infectionProbability;
          (this.model as SIR).refractoryProbability = this.refractoryProbability;
          break;
        case 'SIS':
          (this.model as SIS).infectionProbability = this.infectionProbability;
          (this.model as SIS).susceptibleProbability = this.susceptibleProbability;
          break;
        case 'SIRS':
          (this.model as SIRS).infectionProbability = this.infectionProbability;
          (this.model as SIRS).refractoryProbability = this.refractoryProbability;
          (this.model as SIRS).susceptibleProbability = this.susceptibleProbability;
          break;
        case 'SCIR':
          (this.model as SCIR).infectionProbability = this.infectionProbability;
          (this.model as SCIR).refractoryProbability = this.refractoryProbability;
          break;
      }
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
    this.reachedNodes = 0;

    // Reset series
    this.totalActive = { data: [], xExtent: [0, 10], yExtent: [0, this.graph!.nodes.size] };
    this.clusterActive = new Map();
    this.clusters = [];

    // Prevent event chaining
    if (!noSeedEvent) {
      // Render
      this.config.diffusionNodeStates.next(this.originalNodeStates); // Don't need to copy because we copy on play
    }
  }

  public onClear() {
    for (const n of this.graph!.nodes.keys()) {
      this.originalNodeStates.set(n, "susceptible");
    }
    // Render
    this.config.diffusionNodeStates.next(this.originalNodeStates); // Also don't need to copy, assuming we are always clean before clear
  }

  private onTick() {
    // Tick
    if (!this.model!.tick()) {
      this.onPause();
      return;
    }

    // Calculate per cluster
    this.reachedNodes = this.model!.reachedNodes.size;
    this.infectedNodes = 0;
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
        this.infectedNodes += count;
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
      y: this.infectedNodes
    });
    if (this.totalActive.xExtent[1] <= this.step) {
      this.totalActive.xExtent[1] = Math.round(1.5 * this.totalActive.xExtent[1]);
    }

    this.totalActive = {...this.totalActive};
    this.step++;

    // Render
    this.config.diffusionNodeStates.next(this.model!.nodeState);
  }
}
