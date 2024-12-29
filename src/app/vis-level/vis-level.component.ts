import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ConfigurationService } from '../configuration.service';
import { Utility } from '../utility';
import { TutorialService } from '../tutorial.service';

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
export class VisLevelComponent implements OnChanges {
  public level = 1;
  public levelText = "1";
  public maxLevel = 1

  @Input()
  public allowNodeLevel = false;

  @Output()
  public levelChange = new EventEmitter<number>();

  constructor(private config: ConfigurationService) {
    config.configuration.subscribe(cfg => {
      this.maxLevel = Utility.getDepth(cfg.definition.graph);
    });
  }

  public ngOnChanges(changes: SimpleChanges) {
    if (changes["allowNodeLevel"] && !this.allowNodeLevel && this.level == 0) {
      this.level = this.maxLevel;
      this.update();
    }
  }

  public onIncrement() {
    if (this.allowNodeLevel && this.level + 1 > this.maxLevel) {
      this.level = 0;
    } else if (this.level != 0) {
      this.level = Math.min(this.maxLevel, this.level + 1);
    }
    this.update();
  }

  public onDecrement() {
    if (this.allowNodeLevel && this.level == 0) {
      this.level = this.maxLevel;
    } else {
      this.level = Math.max(1, this.level - 1);
    }
    this.update();
  }

  private update() {
    this.levelText = this.level == 0 ? "N" : this.level.toString();
    this.levelChange.emit(this.level);
    // this.config.selectedConnections.next([]);
  }

  public onChange(event: WheelEvent) {
    if (!event.shiftKey) {
      return;
    }
    event.stopPropagation();
    const value = event.deltaY;
    if (value > 0) {
      this.onIncrement();
    } else if (value < 0) {
      this.onDecrement();
    }
  }
}
