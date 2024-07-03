import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ConfigurationService } from '../configuration.service';
import { NodeData } from '../graph';
import { Utility } from '../utility';
import { EmptyInstance } from '../graph-configuration';

@Component({
  selector: 'app-tab-import-export',
  standalone: true,
  imports: [
    MatButtonModule
  ],
  templateUrl: './tab-import-export.component.html',
  styleUrl: './tab-import-export.component.css'
})
export class TabImportExportComponent {

  constructor(private config: ConfigurationService) {}

  public onImportConfiguration(files: FileList | null) {
    if (files == null) {
      return;
    }

    const file = files[0];
    const reader = new FileReader();
    reader.onload = e => {
      if (e.target?.result == null) {
        return;
      }

      const definition = Utility.parse(e.target.result.toString());

      this.config.configuration.value.definition = definition;
      this.config.configuration.value.instance = EmptyInstance;
      this.config.history.next([]);
      this.config.update("Import graph");
    }
    reader.readAsText(file);
  }

  public onExportConfiguration() {
    const str = Utility.stringify(this.config.configuration.value.definition);
    this.download("export.json", str, "application/json");
  }

  public onExportGraph() {
    if (this.config.configuration.value.instance.graph.nodes.length == 0) {
      alert("No graph!");
      return;
    }
    const csv: string[] = ["node1,node2,cluster1,cluster2"];
    for (const e of this.config.configuration.value.instance.graph.edges) {
      const sourceData = e.source.data as NodeData;
      const targetData = e.target.data as NodeData;
      csv.push(`${e.source.id},${e.target.id},${sourceData.clusterID},${targetData.clusterID}`);
    }
    const str = csv.join("\n");
    this.download("graph.csv", str, "text/csv");
  }

  private download(name: string, str: string, type: string) {
    const blob = new Blob([str], { type: type });
    const data = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = data;
    link.download = name;
    link.click();
    link.remove();
  }
}
