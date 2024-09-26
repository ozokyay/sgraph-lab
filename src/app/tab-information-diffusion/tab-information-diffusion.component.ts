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
  public diffusionModel: "SI" | "LT" = "SI";
  public activationProbability = 0.1;
  public simulationSpeed = 10;
  public totalActive: Series = EmptySeries;
  public stepActive: Series = EmptySeries;
  public seedNodes: Set<Node> = new Set();
  public step = 0;
  public running = false;
  public dirty = false;

  private graph?: AdjacencyList;
  private originalSeedNodes: Set<Node> = new Set();
  private intervalID = 0;

  constructor(private config: ConfigurationService) {
    config.configuration.subscribe(configuration => {
      this.graph = new AdjacencyList(configuration.instance.graph);
      this.seedNodes.clear();
      this.originalSeedNodes.clear();
      this.onPause();
      this.onReset(true);
    });
    config.selectedDiffusionSeeds.subscribe(seeds => {
      this.seedNodes = seeds;
    });
  }

  public onPlay() {
    if (!this.dirty) {
      this.originalSeedNodes = new Set(this.seedNodes);
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
    this.seedNodes.clear();
    for (const n of this.originalSeedNodes) {
      this.seedNodes.add(n);
    }

    // Reset series
    this.totalActive = { data: [], xExtent: [0, 10], yExtent: [0, this.graph!.nodes.size] };
    this.stepActive = { data: [], xExtent: [0, 10], yExtent: [0, this.graph!.nodes.size] };

    // Prevent event chaining
    if (!noSeedEvent) {
      // Render
      this.config.selectedDiffusionSeeds.next(this.seedNodes);
    }
  }

  public onClear() {
    this.seedNodes.clear();
    this.originalSeedNodes.clear();
    // Render
    this.config.selectedDiffusionSeeds.next(this.seedNodes);
  }

  private onTick() {
    // Check stop condition
    if (this.seedNodes.size == this.graph!.nodes.size) {
      this.onPause();
      return;
    } else {
      let done = true;
      for (const n of this.seedNodes) {
        for (const [e, m] of this.graph!.nodes.get(n)!) {
          if (!this.seedNodes.has(m)) {
            done = false;
            break;
          }
        }
      }
      if (done) {
        this.onPause();
        return;
      }
    }

    // Propagate activation through network
    const toAdd = new Set<Node>()
    for (const active of this.seedNodes) {
      const neighbors = this.graph!.nodes.get(active)!;
      for (const [e, n] of neighbors) {
        if (!this.seedNodes.has(n) && !toAdd.has(n) && Math.random() < this.activationProbability) {
          toAdd.add(n);
        }
      }
    }
    for (const n of toAdd) {
      this.seedNodes.add(n);
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
  }
}
