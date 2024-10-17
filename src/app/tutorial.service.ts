import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TutorialService {

  public tabClusterList!: HTMLElement;
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

  public highlightClusterList = false;
  public highlightPrimaryVis = false;
  public highlightSecondaryVis = false;
  public highlightPrimaryLevelVis = false;
  public highlightPrimaryOptions = false;
  public highlightTabs = false;
}
