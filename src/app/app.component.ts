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
        TabImportExportComponent,
        TabClusterComponent,
        TabClusterListComponent,
        TabConnectionsComponent,
        TabNlSettingsComponent,
        TabStatisticsComponent,
        VisNodeLinkComponent
    ]
})
export class AppComponent implements OnInit {

  public pyodideReady = false;
  public selectedTabIndex = 0;
  public dragging = false;

  @ViewChild('nodeLinkDiagram')
  private nodeLinkDiagram!: VisNodeLinkComponent;
  
  constructor(public python: PythonService) {
    
  }

  public onSelectedTabChange() {

  }

  public async ngOnInit() {
    await this.python.initPython();
    this.pyodideReady = true;
  }

  public onDragStart() {
    this.dragging = true;
  }

  public onDragEnd() {
    this.dragging = false;
  }

  @HostListener('document:mousemove')
  onMouseMove() {
    if (this.dragging) {
      this.nodeLinkDiagram.resize();
    }
  }
}
