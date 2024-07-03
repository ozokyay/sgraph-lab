import { Component } from '@angular/core';
import { ClusterConnection } from '../cluster-connection';
import { ConfigurationService } from '../configuration.service';
import { MatButtonModule } from '@angular/material/button';
import { MatSliderModule } from '@angular/material/slider';
import { VisLineChartComponent } from '../vis-line-chart/vis-line-chart.component';
import { Series, Uniform10 } from '../series';
import { Edge } from '../graph';
import { Utility } from '../utility';
import { Cluster } from '../cluster';
import { Point } from '../point';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ClusterIDPipe } from '../cluster-id-pipe';

@Component({
  selector: 'app-tab-connections',
  standalone: true,
  imports: [
    MatButtonModule,
    MatSliderModule,
    MatSlideToggleModule,
    VisLineChartComponent,
    ClusterIDPipe
  ],
  templateUrl: './tab-connections.component.html',
  styleUrl: './tab-connections.component.css'
})
export class TabConnectionsComponent {
  public connections: Edge[] = [];
  public multiEditing: boolean = false;

  public edgeCount: number = 0;
  public nodeCountSource: number = 0;
  public nodeCountTarget: number = 0;
  public degreeAssortativity: number = 0;

  public sourceName: string = "";
  public targetsName: string = "";

  public degreeDistributionSource?: Series = undefined;
  public degreeDistributionTarget?: Series = undefined;
  public actualDistributionSource: Series = structuredClone(Uniform10);
  public actualDistributionTarget: Series = structuredClone(Uniform10);

  constructor(private config: ConfigurationService) {
    config.selectedConnections.subscribe(edges => {
      this.connections = edges;
      this.render();
    });
    config.configuration.subscribe(config => {
      // TODO: Set preview distributions to product from measures cluster distributions
      // Compute

      // Also rerender everything from above
      // => render()

      this.render();
    });
  }

  private render() {
    // Requires: selected clusters available in current instance (should always be: select after create)
    
    if (this.connections.length == 0) {
      return;
    }

    this.multiEditing = true;

    // Either only one connection or multi-editing means all are equivalent
    const first = this.connections[0];
    const firstConn = first.data as ClusterConnection;

    // Get involved cluster measures
    const clusterSource = this.config.configuration.value.instance.clusterMeasures.get(first.source.data as Cluster)!;
    const clusterTargets = this.connections.map(c =>
      this.config.configuration.value.instance.clusterMeasures.get(c.target.data as Cluster)!
    );

    // Set values
    this.nodeCountSource = firstConn.nodeCountSource * clusterSource.nodeCount;
    this.nodeCountTarget = clusterTargets.map(c => c.nodeCount).reduce((a, b) => a + b);
    const edgeCountTargets = clusterTargets.map(c => c.edgeCount).reduce((a, b) => a + b);
    const edgeCount = firstConn.edgeCount * Math.min(clusterSource.edgeCount, edgeCountTargets, this.nodeCountSource * this.nodeCountTarget);
    this.edgeCount = edgeCount;
    this.degreeAssortativity = firstConn.degreeAssortativity;

    // Set string labels
    this.sourceName = "community " +  first.source.id.toString();
    if (this.connections.length == 1) {
      this.targetsName = "community";
    } else {
      this.targetsName = "communities";
    }

    // Compute distributions

    // Unset distributions must be kept updated => Just set to null in srvc? stooopid
    // Idea: Set to null to ignore bias, use toggle to enable bias => no longer null, updated by service
    // How many handles, what resolution? => no handles, tabular input
    // Or: only show handles for changes => smoothing missing, very stupid stuff
    // Compute preview from sum

    // Update linechart (don't even clone - direct modifications)
    this.degreeDistributionSource = firstConn.degreeDistributionSource;
    this.degreeDistributionTarget = firstConn.degreeDistributionTarget;

    // On enabled: copy measured distribution, show
    // But this is still stupid when changing clusters...
    // Which way is least stupid?
    // => entirely custom distribution, starting with uniform, completely disconnected from current cluster distributions => actually good idea
    // How to show actual? => from final graph
    // preview -> actual
    

    // Check consistency and multi-editing
    for (const edge of this.connections) {
      if (edge.source != first.source) {
        console.log("Error: Inconsistent source on current edge selection");
        break;
      }

      const conn = edge.data as ClusterConnection;
      if (conn.edgeCount != firstConn.edgeCount ||
        conn.nodeCountSource != firstConn.nodeCountSource ||
        conn.nodeCountTarget != firstConn.nodeCountTarget ||
        conn.degreeAssortativity != firstConn.degreeAssortativity ||
        (conn.degreeDistributionSource && !firstConn.degreeDistributionSource) || // Stooopid
        (conn.degreeDistributionTarget && !firstConn.degreeDistributionTarget) ||
        (!conn.degreeDistributionSource && firstConn.degreeDistributionSource) ||
        (!conn.degreeDistributionTarget && firstConn.degreeDistributionTarget) ||
        conn.degreeDistributionSource && firstConn.degreeDistributionSource && !Utility.arraysEqual(conn.degreeDistributionSource!.data, firstConn.degreeDistributionSource!.data) ||
        conn.degreeDistributionTarget && firstConn.degreeDistributionTarget && !Utility.arraysEqual(conn.degreeDistributionTarget!.data, firstConn.degreeDistributionTarget!.data)
      ) {
        this.multiEditing = false;
      }

      this.targetsName += " " + edge.target.id.toString();
    }
  }

  public onReset() {
    if (this.connections == undefined) {
      console.log("Connections undefined");
      return;
    }

    // Set all variables to 0
    this.edgeCount = 0;
    this.nodeCountSource = 0;
    this.nodeCountTarget = 0;
    this.degreeAssortativity = 0;
    this.degreeDistributionSource = undefined;
    this.degreeDistributionTarget = undefined;
    for (const edge of this.connections) {
      const conn = edge.data as ClusterConnection;
      conn.edgeCount = this.edgeCount;
      conn.nodeCountSource = this.nodeCountSource;
      conn.nodeCountTarget = this.nodeCountTarget;
      conn.degreeAssortativity = this.degreeAssortativity;
      conn.degreeDistributionSource = undefined;
      conn.degreeDistributionTarget = undefined;
    }
    this.multiEditing = true;
    this.onChange();
  }

  public onChange() {
    if (this.connections == undefined) {
      console.log("Connections undefined");
      return;
    }

    // Apply variables to all
    for (const edge of this.connections) {
      const conn = edge.data as ClusterConnection;
      conn.edgeCount = this.edgeCount;
      conn.nodeCountSource = this.nodeCountSource;
      conn.nodeCountTarget = this.nodeCountTarget;
      conn.degreeAssortativity = this.degreeAssortativity;
      conn.degreeDistributionSource = structuredClone(this.degreeDistributionSource);
      conn.degreeDistributionTarget = structuredClone(this.degreeDistributionTarget);
    }

    this.config.update("Changed connections");
  }

  public onChangeDistributionSource(value: boolean) {
    console.log("changed on render()");
    // if value then set to uniform with correct extent else set to undefined
  }

  public onChangeDistributionTarget(value: boolean) {

  }
}
