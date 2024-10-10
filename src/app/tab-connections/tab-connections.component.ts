import { Component } from '@angular/core';
import { ClusterConnection } from '../cluster-connection';
import { ConfigurationService } from '../configuration.service';
import { MatButtonModule } from '@angular/material/button';
import { MatSliderModule } from '@angular/material/slider';
import { VisLineChartComponent } from '../vis-line-chart/vis-line-chart.component';
import { EmptySeries, Series, Uniform10 } from '../series';
import { Edge } from '../graph';
import { Utility } from '../utility';
import { Cluster } from '../cluster';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';

// To make things clear once and for all:
// - Edge count is the actual number (no intuitive range for normalization)
// - Node count is normalized (multi-editing, want to keep for 1:N)
// - Solution for N:N is full matrix or arrow/colors
// - Good advantage of minimap!

@Component({
  selector: 'app-tab-connections',
  standalone: true,
  imports: [
    MatButtonModule,
    MatSliderModule,
    MatSlideToggleModule,
    MatInputModule,
    MatFormFieldModule,
    FormsModule,
    VisLineChartComponent
  ],
  templateUrl: './tab-connections.component.html',
  styleUrl: './tab-connections.component.css'
})
export class TabConnectionsComponent {
  public connections: Edge[] = [];
  public multiEditing: boolean = false;

  public edgeCount = 0;
  public nodeCountSource = 0;
  public nodeCountTarget = 0;
  public degreeAssortativity = 0;
  public maxEdgeCount = 0;

  public sourceName: string = "";
  public targetName: string = "";

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
      this.render();
    });
  }

  private getEffectiveDistribution(side: "source" | "target"): Series {
    // TODO: Want to show after drawing instead??

    // Effective range, scale to 1 to reflect that scale doesn't matter
    const distributions = this.connections.map(e => this.config.configuration.value.instance.clusterMeasures.get(side == "source" ? e.source.id : e.target.id)!.degreeDistribution);
    const avg = Utility.averageDistributions(distributions);
    const max = avg.data.reduce((a, b) => Math.max(a, b.y), 0);
    Utility.multiplyPointValues(avg.data, 1 / max);
    avg.yExtent = [0, 1];
    return avg;
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
    const measuresSource = this.connections.map(c =>
      this.config.configuration.value.instance.clusterMeasures.get(c.source.id)!
    );
    const measuresTarget = this.connections.map(c =>
      this.config.configuration.value.instance.clusterMeasures.get(c.target.id)!
    );

    // Clamp and apply
    const maxNodeCountSource = measuresSource.reduce((v, m) => Math.min(v, m.nodeCount), Number.MAX_SAFE_INTEGER);
    const maxNodeCountTarget = measuresTarget.reduce((v, m) => Math.min(v, m.nodeCount), Number.MAX_SAFE_INTEGER);
    this.maxEdgeCount = maxNodeCountSource * maxNodeCountTarget;
    this.edgeCount = Math.min(firstConn.edgeCount, this.maxEdgeCount);
    this.nodeCountSource = firstConn.sourceNodeCount * 100;
    this.nodeCountTarget = firstConn.targetNodeCount * 100;
    this.degreeAssortativity = firstConn.degreeAssortativity;

    // Compute distributions

    // Unset distributions must be kept updated => Just set to null in srvc? stooopid
    // Idea: Set to null to ignore bias, use toggle to enable bias => no longer null, updated by service
    // How many handles, what resolution? => no handles, tabular input
    // Or: only show handles for changes => smoothing missing, very stupid stuff
    // Compute preview from sum

    // Update linechart (don't even clone - direct modifications)
    this.degreeDistributionSource = firstConn.sourceDegreeDistribution;
    this.degreeDistributionTarget = firstConn.targetDegreeDistribution;

    this.actualDistributionSource = this.getEffectiveDistribution("source");
    this.actualDistributionTarget = this.getEffectiveDistribution("target");

    // On enabled: copy measured distribution, show
    // But this is still stupid when changing clusters...
    // Which way is least stupid?
    // => entirely custom distribution, starting with uniform, completely disconnected from current cluster distributions => actually good idea
    // How to show actual? => from final graph
    // preview -> actual
    
    this.sourceName = "";
    this.targetName = "";

    // Check consistency and multi-editing
    for (const edge of this.connections) {
      const conn = edge.data as ClusterConnection;
      if (conn.edgeCount != firstConn.edgeCount ||
        conn.sourceNodeCount != firstConn.sourceNodeCount ||
        conn.targetNodeCount != firstConn.targetNodeCount ||
        conn.degreeAssortativity != firstConn.degreeAssortativity ||
        (!conn.sourceDegreeDistribution != !firstConn.sourceDegreeDistribution) ||
        (!conn.targetDegreeDistribution != !firstConn.targetDegreeDistribution) ||
        conn.sourceDegreeDistribution && firstConn.sourceDegreeDistribution && !Utility.arraysEqual(conn.sourceDegreeDistribution!.data, firstConn.sourceDegreeDistribution!.data) ||
        conn.targetDegreeDistribution && firstConn.targetDegreeDistribution && !Utility.arraysEqual(conn.targetDegreeDistribution!.data, firstConn.targetDegreeDistribution!.data)
      ) {
        this.multiEditing = false;
      }

      this.sourceName += (edge.source.data as Cluster).name + " ";
      this.targetName += (edge.target.data as Cluster).name + " ";
    }
  }

  public onReset() {
    if (this.connections == undefined) {
      console.log("Connections undefined");
      return;
    }

    // Set all variables to default values
    this.edgeCount = 0;
    this.nodeCountSource = 100;
    this.nodeCountTarget = 100;
    this.degreeAssortativity = 0;
    this.degreeDistributionSource = undefined;
    this.degreeDistributionTarget = undefined;
    for (const edge of this.connections) {
      const conn = edge.data as ClusterConnection;
      conn.edgeCount = this.edgeCount;
      conn.sourceNodeCount = this.nodeCountSource / 100;
      conn.targetNodeCount = this.nodeCountTarget / 100;
      conn.degreeAssortativity = this.degreeAssortativity;
      conn.sourceDegreeDistribution = undefined;
      conn.targetDegreeDistribution = undefined;
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
      conn.sourceNodeCount = this.nodeCountSource / 100;
      conn.targetNodeCount = this.nodeCountTarget / 100;
      conn.degreeAssortativity = this.degreeAssortativity;
      conn.sourceDegreeDistribution = structuredClone(this.degreeDistributionSource);
      conn.targetDegreeDistribution = structuredClone(this.degreeDistributionTarget);

      // Must apply to graph because selection doesn't do it (handle deletion, also there are multiple selection UIs)
      this.config.configuration.value.definition.graph.removeEdge(edge);
      this.config.configuration.value.definition.graph.addEdge(edge);

      // Could even delete, but don't want to lose other properties
    }

    this.config.update("Changed connections");
  }

  public onChangeDistributionSource(value: boolean) {
    // A) Uniform distribution
    // B) Actual distribution (preferred)

    // Pros and Cons
    // A) Simple, no problems with multi, does not really matter anyway
    // B) A bit nicer, more user-friendly (bonus), BUT too many handles

    let distribution: Series | undefined = undefined;
    if (value) {
      // Effective range, scale to 1 to reflect that scale doesn't matter
      distribution = {
        data: [
          { x: 1, y: 0.5 },
          { x: 1, y: 0.5 }
        ],
        xExtent: [1, 1],
        yExtent: [0, 1]
      };
      for (const edge of this.connections) {
        const dist = this.config.configuration.value.instance.clusterMeasures.get(edge.source.id)!.degreeDistribution;
        // distribution = Utility.addDistributions(distribution, dist);
        distribution.xExtent[1] = Math.max(distribution.xExtent[1], dist.xExtent[1]);
      }
      distribution.data[1].x = distribution.xExtent[1];
      // const max = distribution.data.reduce((a, b) => Math.max(a, b.y), 0);
      // Utility.multiplyPointValues(distribution.data, 1 / max);
      // distribution.yExtent = [0, 1];
    }
    for (const edge of this.connections) {
      const conn = edge.data as ClusterConnection;
      conn.sourceDegreeDistribution = structuredClone(distribution);
    }
    this.degreeDistributionSource = distribution;
  }

  public onChangeDistributionTarget(value: boolean) {
    let distribution: Series | undefined = undefined;
    if (value) {
      distribution = {
        data: [
          { x: 1, y: 0.5 },
          { x: 1, y: 0.5 }
        ],
        xExtent: [1, 1],
        yExtent: [0, 1]
      };
      for (const edge of this.connections) {
        const dist = this.config.configuration.value.instance.clusterMeasures.get(edge.target.id)!.degreeDistribution;
        distribution.xExtent[1] = Math.max(distribution.xExtent[1], dist.xExtent[1]);
      }
      distribution.data[1].x = distribution.xExtent[1];
    }
    for (const edge of this.connections) {
      const conn = edge.data as ClusterConnection;
      conn.targetDegreeDistribution = structuredClone(distribution);
    }
    this.degreeDistributionTarget = distribution;
  }

  public onClear() {
    this.config.selectedConnections.next([]);
    this.config.activeTab.next(0);
  }
}
