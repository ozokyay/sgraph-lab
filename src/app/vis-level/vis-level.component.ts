import { Component, EventEmitter, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ConfigurationService } from '../configuration.service';
import { AdjacencyList, Node } from '../graph';
import { Cluster } from '../cluster';
import { Utility } from '../utility';

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

  @Output()
  public levelChange = new EventEmitter<number>();

  constructor(private config: ConfigurationService) {
    config.configuration.subscribe(cfg => {
      this.maxLevel = Utility.getDepth(cfg.definition.graph);
    });
  }

  public onIncrement() {
    this.level = Math.min(this.maxLevel, this.level + 1);
    this.levelChange.emit(this.level);
    this.config.selectedConnections.next([]);
  }

  public onDecrement() {
    this.level = Math.max(1, this.level - 1);
    this.levelChange.emit(this.level);
    this.config.selectedConnections.next([]);
  }

  public onChange(value: number) {
    if (value > 0) {
      this.onIncrement();
    } else if (value < 0) {
      this.onDecrement();
    }
  }
}
