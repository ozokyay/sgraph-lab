import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ConfigurationService } from '../configuration.service';
import { AdjacencyList, Node } from '../graph';
import { Cluster } from '../cluster';

@Component({
  selector: 'app-vis-level',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './vis-level.component.html',
  styleUrl: './vis-level.component.css'
})
export class VisLevelComponent {
  public level = 1;
  public maxLevel = 1

  constructor(private config: ConfigurationService) {
    config.level.subscribe(l => {
      this.level = l;
    });
    config.configuration.subscribe(cfg => {
      this.maxLevel = this.getDepth(cfg.definition.graph.getNodes());
    });
  }

  public onIncrement() {
    this.config.level.next(Math.min(this.maxLevel, this.level + 1));
  }

  public onDecrement() {
    this.config.level.next(Math.max(1, this.level - 1));
  }

  private getDepth(nodes: Node[]): number {
    let depth = 1;
    for (let node of nodes) {
      let d = 1;
      let cluster = node.data as Cluster;
      while (cluster.parent != -1) {
        node = this.config.configuration.value.definition.graph.nodeDictionary.get(cluster.parent)!;
        cluster = node.data as Cluster;
        d++;
      }
      depth = Math.max(d, depth);
    }
    return depth;
  }
}
