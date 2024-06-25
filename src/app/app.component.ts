import { Component, HostListener, OnInit } from '@angular/core';
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
        TabConnectionsComponent
    ]
})
export class AppComponent implements OnInit {

  public selectedTabIndex: number = 0;
  public dragging: boolean = false;
  
  constructor(public python: PythonService, private config: ConfigurationService) {
    // Children take directly from config
    // What about selectedCluster?
    // Probably also better in service because of deletion etc

    // Or handle this kind of state centrally in app component? Weird mix?
  }

  public onSelectedTabChange() {

  }

  public ngOnInit() {
    this.python.initPython();
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
      // this.graphDiagram.resize();
    }
  }
}
