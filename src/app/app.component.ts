import { Component, HostListener, OnInit, ViewChild } from '@angular/core';
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
export class AppComponent implements OnInit {

  public pyodideReady = false;
  public selectedTabIndex = 0;
  public dragging: boolean[] = [false, false];
  
  @ViewChild('containerPrimary')
  private containerPrimary!: VisContainerComponent;

  @ViewChild('containerSecondary')
  private containerSecondary!: VisContainerComponent;
  
  constructor(public python: PythonService, private config: ConfigurationService) {
    config.selectedConnections.subscribe(connections => {
      if (connections.length > 0) {
        this.selectedTabIndex = 1;
      }
    });
    this.config.activeTab.subscribe(t => {
      if (this.selectedTabIndex != t) {
        this.selectedTabIndex = t;
      }
    });
  }

  public onSelectedTabChange(index: number) {
    // if (index != 1) {
    //   this.config.selectedConnections.next([]); // Really?
    // }
    this.config.activeTab.next(index);
  }

  public async ngOnInit() {
    await this.python.initPython();
    this.pyodideReady = true;
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
}
