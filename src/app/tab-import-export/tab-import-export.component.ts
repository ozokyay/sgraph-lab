import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

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
      // const { clusters, links } = Utility.parse(e.target.result.toString());

      console.log(e.target.result.toString().length);

      // Can implement when cluster class is available

    }
    reader.readAsText(file);
  }

  public onExportConfiguration() {
    // all random seeds (sampling, layout)
    // const settings = { clusters: this.config.communities.value, links: this.config.communityLinks.value };
    // const str = Utility.stringify(settings);
    // this.download("export.json", str, "application/json");
  }

  public onExportGraph() {
    // if (this.mainGraph == undefined || this.mainGraph.nodes.length == 0) {
    //   alert("No graph!");
    //   return;
    // }
    // const csv: string[] = ["node1,node2,community1,community2"];
    // for (const e of this.mainGraph.edges as ReferenceEdge[]) {
    //   csv.push(`${e.source},${e.target},${e.sourceNode.data.id},${e.targetNode.data.id}`);
    // }
    // const str = csv.join("\n");
    // this.download("graph.csv", str, "text/csv");
  }
}
