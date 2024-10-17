import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TutorialService {

  public buttonAddCluster!: HTMLElement;
  public visPrimary!: HTMLElement;
  public visSecondary!: HTMLElement;
  public tabs!: HTMLElement;

  public start = new Subject<void>();
  public primaryVisLevel = new Subject<number>();
  public secondaryVisLevel = new Subject<number>();
  public primaryCircular = new Subject<boolean>();
  public primaryDiffusionMode = new Subject<boolean>();
  public update = new Subject<void>();
  public playDiffusion = new Subject<void>();
  public stopDiffusion = new Subject<void>();
}
