import { AfterViewInit, Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTabsModule } from '@angular/material/tabs';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field'
import { AngularSplitModule } from 'angular-split';
import { PythonService } from './python.service';
import { TabImportExportComponent } from './tab-import-export/tab-import-export.component';
import { TabClusterComponent } from './tab-cluster/tab-cluster.component';
import { ConfigurationService } from './configuration.service';
import { TabClusterListComponent } from "./tab-cluster-list/tab-cluster-list.component";
import { TabConnectionsComponent } from './tab-connections/tab-connections.component';
import { Uniform10 } from './series';
import { VisNodeLinkComponent } from './vis-node-link/vis-node-link.component';
import { TabNlSettingsComponent } from './tab-nl-settings/tab-nl-settings.component';
import { TabStatisticsComponent } from './tab-statistics/tab-statistics.component';
import { TabInformationDiffusionComponent } from "./tab-information-diffusion/tab-information-diffusion.component";
import { VisMatrixComponent } from "./vis-matrix/vis-matrix.component";
import { VisLevelComponent } from "./vis-level/vis-level.component";
import { VisNodeLink2Component } from './vis-node-link-2/vis-node-link-2.component';
import { VisContainerComponent } from "./vis-container/vis-container.component";
import { TabHelpComponent } from './tab-help/tab-help.component';
import { TutorialService } from './tutorial.service';

@Component({
    selector: 'app-root',
    standalone: true,
    templateUrl: './app.component.html',
    styleUrl: './app.component.css',
    imports: [
    RouterOutlet,
    AngularSplitModule,
    MatTabsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSlideToggleModule,
    TabHelpComponent,
    TabImportExportComponent,
    TabClusterComponent,
    TabClusterListComponent,
    TabConnectionsComponent,
    TabNlSettingsComponent,
    TabStatisticsComponent,
    VisNodeLinkComponent,
    VisNodeLink2Component,
    TabInformationDiffusionComponent,
    VisMatrixComponent,
    VisLevelComponent,
    VisContainerComponent
]
})
export class AppComponent implements OnInit, AfterViewInit {

  public pyodideReady = false;
  public selectedTabIndex = 0;
  public dragging: boolean[] = [false, false];
  
  @ViewChild('containerPrimary')
  private containerPrimary!: VisContainerComponent;

  @ViewChild('containerSecondary')
  private containerSecondary!: VisContainerComponent;

  @ViewChild('containerPrimary', { read: ElementRef })
  private containerPrimaryRef!: ElementRef;

  @ViewChild('containerSecondary', { read: ElementRef })
  private containerSecondaryRef!: ElementRef;

  @ViewChild('tabs', { read: ElementRef })
  private tabsRef!: ElementRef;

  @ViewChild('tabClusterList', { read: ElementRef })
  private tabClusterList!: ElementRef;
  
  constructor(public python: PythonService, private config: ConfigurationService, public tutorial: TutorialService) {
    config.selectedConnections.subscribe(connections => {
      if (connections.length > 0) {
        this.selectedTabIndex = 2;
      }
    });
    this.config.activeTab.subscribe(t => {
      if (this.selectedTabIndex != t) {
        this.selectedTabIndex = t;
      }
    });
    this.tutorial.start.subscribe(() => {
      this.containerPrimary.visualization = "node-link";
      this.containerSecondary.visualization = "matrix";
      this.containerPrimary.changeLevel(1);
      this.containerSecondary.changeLevel(1);
    });
    this.tutorial.primaryVisLevel.subscribe(l => {
      this.containerPrimary.changeLevel(l);
    });
    this.tutorial.secondaryVisLevel.subscribe(l => {
      this.containerSecondary.changeLevel(l);
    });
    this.tutorial.primaryCircular.subscribe(b => {
      this.containerPrimary.toggleCircular.checked = b;
    });
    this.tutorial.primaryDiffusionMode.subscribe(b => {
      this.containerPrimary.toggleNodeColor.checked = b;
      this.containerPrimary.toggleEdgeColor.checked = b;
    });
  }

  public onSelectedTabChange(index: number) {
    // if (index != 2) {
    //   this.config.selectedConnections.next([]); // Really?
    // }
    this.config.activeTab.next(index);
  }

  public async ngOnInit() {
    await this.python.initPython();
    this.pyodideReady = true;
  }

  public ngAfterViewInit() {
    this.tutorial.visPrimary = this.containerPrimaryRef.nativeElement;
    this.tutorial.visSecondary = this.containerSecondaryRef.nativeElement;
    this.tutorial.tabClusterList = this.tabClusterList.nativeElement;
    this.tutorial.tabs = this.tabsRef.nativeElement;
  }

  @HostListener('document:mousemove')
  onMouseMove() {
    if (this.dragging[0]) {
      this.containerPrimary.resize();
      this.containerSecondary.resize();
    }
    if (this.dragging[1]) {
      this.containerSecondary.resize();
    }
  }

  @HostListener('window:resize')
  resize() {
    this.containerPrimary.resize();
    this.containerSecondary.resize();
  }

  @HostListener('window:beforeunload', ['$event'])
  windowBeforeUnload(event: BeforeUnloadEvent) {
    return this.config.configuration.value.definition.graph.nodes.size == 0;
  }
}
