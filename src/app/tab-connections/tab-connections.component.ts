import { Component } from '@angular/core';
import { ClusterConnection } from '../cluster-connection';
import { ConfigurationService } from '../configuration.service';
import { MatButtonModule } from '@angular/material/button';
import { MatSliderModule } from '@angular/material/slider';
import { VisLineChartComponent } from '../vis-line-chart/vis-line-chart.component';
import { Series, Uniform10 } from '../series';
import { Edge } from '../graph';
import { Utility } from '../utility';

@Component({
  selector: 'app-tab-connections',
  standalone: true,
  imports: [
    MatButtonModule,
    MatSliderModule,
    VisLineChartComponent
  ],
  templateUrl: './tab-connections.component.html',
  styleUrl: './tab-connections.component.css'
})
export class TabConnectionsComponent {
  public connections: Edge[] = [];
  public multiEditing: boolean = false;

  public edges: number = 0;
  public nodes1: number = 0;
  public nodes2: number = 0;
  public degreeAssortativity: number = 0;

  public sourceName: string = "";
  public targetsName: string = "";

  public degreeDistribution1: Series = structuredClone(Uniform10);
  public degreeDistribution2: Series = structuredClone(Uniform10);
  public previewDistribution1: Series = structuredClone(Uniform10);
  public previewDistribution2: Series = structuredClone(Uniform10);

  constructor(private config: ConfigurationService) {
    config.selectedConnections.subscribe(edges => {
      this.connections = edges;
      if (edges.length == 0) {
        return;
      }

      this.multiEditing = true;
      const first = edges[0];
      const firstConn = first.data as ClusterConnection;

      // Set values
      this.edges = firstConn.edgeCount; // TODO: must calc, round
      this.nodes1 = firstConn.nodeCount1; // TODO: must calc, round
      this.nodes2 = firstConn.nodeCount2;
      this.degreeAssortativity = firstConn.degreeAssortativity;
      this.degreeDistribution1 = structuredClone(firstConn.degreeDistribution1);
      this.degreeDistribution2 = structuredClone(firstConn.degreeDistribution2);
      // Set string labels
      this.sourceName = "community " +  first.source.id.toString();
      if (edges.length == 1) {
        this.targetsName = "community";
      } else {
        this.targetsName = "communities";
      }

      for (const edge of edges) {
        if (edge.source != first.source) {
          console.log("Error: Inconsistent source on current edge selection");
          break;
        }

        const conn = edge.data as ClusterConnection;
        if (conn.edgeCount != firstConn.edgeCount ||
          conn.nodeCount1 != firstConn.nodeCount1 ||
          conn.nodeCount2 != firstConn.nodeCount2 ||
          conn.degreeAssortativity != firstConn.degreeAssortativity ||
          Utility.arraysEqual(conn.degreeDistribution1.data, firstConn.degreeDistribution1.data) ||
          Utility.arraysEqual(conn.degreeDistribution2.data, firstConn.degreeDistribution2.data)
        ) {
          this.multiEditing = false;
        }

        this.targetsName += " " + edge.target.id.toString();
      }
    });
    config.configuration.subscribe(config => {
      // TODO: Set preview distributions to product from measures cluster distributions
      // Compute
    });
  }

  public onReset() {
    if (this.connections == undefined) {
      console.log("Connections undefined");
      return;
    }

    // Set all variables to 0
    this.edges = 0;
    this.nodes1 = 0;
    this.nodes2 = 0;
    this.degreeAssortativity = 0;
    this.degreeDistribution1 = structuredClone(Uniform10);
    this.degreeDistribution2 = structuredClone(Uniform10);
    for (const edge of this.connections) {
      const conn = edge.data as ClusterConnection;
      conn.edgeCount = this.edges;
      conn.nodeCount1 = this.nodes1;
      conn.nodeCount2 = this.nodes2;
      conn.degreeAssortativity = this.degreeAssortativity;
      conn.degreeDistribution1 = structuredClone(this.degreeDistribution1);
      conn.degreeDistribution2 = structuredClone(this.degreeDistribution2);
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
      // TODO
      // Fast measures will be available for sure
      // Add distributions
      // Copy if necessary
      // Fit extents
      // Compute?
    }

    this.config.update("Changed connections");
  }
}
