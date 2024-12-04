import { ApplicationRef, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { DialogData, DialogTutorialComponent } from '../dialog-tutorial/dialog-tutorial.component';
import { MatDialog } from '@angular/material/dialog';
import { TutorialService } from '../tutorial.service';
import { ConfigurationService } from '../configuration.service';
import { EmptyInstance } from '../graph-configuration';
import { Utility } from '../utility';
import { ExampleGraph } from '../example-graph';
import { Cluster } from '../cluster';

@Component({
  selector: 'app-tab-help',
  standalone: true,
  imports: [
    MatButtonModule,
    MatDividerModule,
    DialogTutorialComponent
  ],
  templateUrl: './tab-help.component.html',
  styleUrl: './tab-help.component.css'
})
export class TabHelpComponent {
  public step!: DialogData;
  readonly dialog = inject(MatDialog);

  private stepCounter = 0;

  constructor(private config: ConfigurationService, private tutorial: TutorialService) {}

  public startTutorial() {
    // Import example graph
    this.config.clear();
    const definition = Utility.parse(ExampleGraph);
    this.config.configuration.value.definition = definition;
    this.config.update("Import graph");
    this.tutorial.start.next();

    // Open dialog
    this.openDialog();
  }

  private openDialog() {
    let done = false;
    let data;
    switch (this.stepCounter) {
      case 0: {
        const pos = {
          x: -1,
          y: -1
        };
        data = {
          title: "Welcome",
          text: "This tutorial will guide you through the steps for building a graph with Network Builder.",
          position: pos
        };
        this.tutorial.primaryVisLevel.next(1);
        break;
      }
    
      case 1: {
        const rect = this.tutorial.tabClusterList.getBoundingClientRect();
        const pos = {
          x: rect.right + 10,
          y: rect.top + 150
        };
        data = {
          title: "Cluster List",
          text: "The cluster list allows you to add and remove clusters. Clusters can have child clusters.",
          position: pos
        };
        this.tutorial.highlightClusterList = true;
        break;
      }

      case 2: {
        const rect = this.tutorial.visPrimary.getBoundingClientRect();
        const pos = {
          x: rect.left + 50,
          y: rect.top + 300
        };
        data = {
          title: "Graph Visualizations",
          text: "There are two views: The primary in the center and the secondary in the top left-hand corner.",
          position: pos
        };
        this.tutorial.highlightClusterList = false;
        this.tutorial.highlightPrimaryVis = true;
        this.tutorial.highlightSecondaryVis = true;
        break;
      }

      case 3: {
        const rect = this.tutorial.visSecondary.getBoundingClientRect();
        const pos = {
          x: rect.right,
          y: rect.top + 100
        };
        data = {
          title: "Adjacency Matrix",
          text: "The matrix provides an overlap-free visualization of the cluster connections all the time, but it is disconnected from the resulting graph and doesn't show the clusters themselves.",
          position: pos
        };
        this.tutorial.highlightPrimaryVis = false;
        break;
      }

      case 4: {
        const rect = this.tutorial.visPrimary.getBoundingClientRect();
        const pos = {
          x: rect.left + 100,
          y: rect.top + 400
        };
        data = {
          title: "Node-Link Diagram",
          text: "The node link diagram shows clusters as nodes and connections between them as edges. By default, force-directed layout is used to position the nodes.",
          position: pos
        };
        this.tutorial.highlightPrimaryVis = true;
        this.tutorial.highlightSecondaryVis = false;
        break;
      }

      case 5: {
        const rect = this.tutorial.visPrimary.getBoundingClientRect();
        const pos = {
          x: rect.right - 560,
          y: rect.top + 80
        };
        data = {
          title: "Levels",
          text: "Each view can independently show information about the graph on a cluster level. The node-link diagram can also show the final result level R.",
          position: pos
        };
        this.tutorial.highlightPrimaryVis = false;
        this.tutorial.highlightPrimaryLevelVis = true;
        this.tutorial.primaryVisLevel.next(0);
        this.tutorial.update.next();
        break;
      }

      case 6: {
        const pos = {
          x: -1,
          y: -1
        };
        data = {
          title: "Node-Link Diagram",
          text: "You can click on a cluster in the list or node-link diagram to select it.",
          position: pos
        };
        this.tutorial.highlightPrimaryLevelVis = false;
        this.tutorial.primaryVisLevel.next(2);
        this.tutorial.secondaryVisLevel.next(2);
        this.tutorial.update.next();
        this.config.selectedCluster.next(this.config.configuration.value.definition.graph.getNodes().find(n => n.id == 6)!.data as Cluster);
        break;
      }

      case 7: {
        const rect = this.tutorial.visPrimary.getBoundingClientRect();
        const pos = {
          x: rect.left + 10,
          y: rect.top + 150
        };
        data = {
          title: "Node-Link Diagram",
          text: "There are different options for highlighting certain parts or encoding variables in the visualization. The egocentric layout is particiularly useful when inspecting or editing a cluster's connections to other cluster because it prevents overlap and hides other edges.",
          position: pos
        };
        this.tutorial.highlightPrimaryOptions = true;
        this.tutorial.primaryCircular.next(true);
        break;
      }

      case 8: {
        const rect = this.tutorial.tabs.getBoundingClientRect();
        const pos = {
          x: rect.left - 600,
          y: rect.top + 200
        };
        data = {
          title: "Cluster Properties",
          text: "In this tab, you configure a cluster. It can directly refer to a cluster in the final graph which is created from a generator, or it can be a group that has child clusters. The replication factor determines how many instances are created from this definition.",
          position: pos
        };
        this.tutorial.highlightPrimaryOptions = false;
        this.tutorial.highlightTabs = true;
        this.config.activeTab.next(1);
        break;
      }

      case 9: {
        const rect = this.tutorial.tabs.getBoundingClientRect();
        const pos = {
          x: rect.left - 600,
          y: rect.top + 200
        };
        data = {
          title: "Cluster Properties",
          text: "The generator takes a distribution of node degrees a its input. You can generate a distribution or edit the points manually.",
          position: pos
        };
        break;
      }

      case 10: {
        const rect = this.tutorial.tabs.getBoundingClientRect();
        const pos = {
          x: rect.left - 600,
          y: rect.top + 200
        };
        data = {
          title: "Cluster Connections",
          text: "After selecting connections from the matrix or node-link diagram, you can configure them in this tab.",
          position: pos
        };

        const cluster = this.config.selectedCluster.value;
        const node = this.config.configuration.value.definition.graph.nodeDictionary.get(cluster!.id)!;
        const edges = this.config.configuration.value.definition.graph.nodes.get(node)!;
        this.config.selectedConnections.next([edges[0][0], edges[2][0]]);
        this.config.activeTab.next(2);
        break;
      }

      case 11: {
        const rect = this.tutorial.tabs.getBoundingClientRect();
        const pos = {
          x: rect.left - 600,
          y: rect.top + 200
        };
        data = {
          title: "Graph Measures",
          text: "The measures tab provides more insight into the resulting graph.",
          position: pos
        };
        this.config.selectedConnections.next([]);
        this.tutorial.primaryCircular.next(false);
        this.config.activeTab.next(3);
        break;
      }

      case 12: {
        const rect = this.tutorial.tabs.getBoundingClientRect();
        const pos = {
          x: rect.left - 600,
          y: rect.top + 200
        };
        data = {
          title: "Layout Settings",
          text: "Layout settings allow you to tune the force-directed layout algorithm. For example, you can use sampling to reduce clutter and improve performance.",
          position: pos
        };
        this.tutorial.primaryVisLevel.next(0);
        this.config.activeTab.next(4);
        break;
      }

      case 13: {
        const rect = this.tutorial.tabs.getBoundingClientRect();
        const pos = {
          x: rect.left - 600,
          y: rect.top + 200
        };
        data = {
          title: "Diffusion Model",
          text: "You can select seed nodes and simulate how information spreads through your graph.",
          position: pos
        };
        this.config.activeTab.next(5);
        this.tutorial.primaryDiffusionMode.next(false);
        this.config.diffusionNodeStates.value.set(this.config.configuration.value.instance.graph.nodes[0], "infected");
        this.config.diffusionNodeStates.next(this.config.diffusionNodeStates.value);
        this.tutorial.playDiffusion.next();
        break;
      }

      case 14: {
        const rect = this.tutorial.tabs.getBoundingClientRect();
        const pos = {
          x: rect.left - 600,
          y: rect.top + 200
        };
        data = {
          title: "Import/Export",
          text: "Here you can import or export your configuration and export the final graph.",
          position: pos
        };
        this.config.activeTab.next(6);
        this.tutorial.primaryDiffusionMode.next(true);
        this.tutorial.stopDiffusion.next();
        break;
      }      

      default: {
        const pos = {
          x: -1,
          y: -1
        };
        data = {
          title: "Done",
          text: "Now you know how to build networks with Network Builder!",
          position: pos
        };
        done = true;
        this.tutorial.highlightTabs = false;
        this.config.clear();
        this.config.update("Empty graph");
        this.config.activeTab.next(0);
        this.tutorial.primaryVisLevel.next(1);
        this.tutorial.secondaryVisLevel.next(1);
        this.tutorial.update.next();
        break;
      }
    }

    const dialogRef = this.dialog.open(DialogTutorialComponent, {
      data: data,
      enterAnimationDuration: this.stepCounter == 0 ? undefined : 0,
      exitAnimationDuration: done ? undefined : 0
    });

    dialogRef.afterClosed().subscribe(result => {
      if (!done) {
        this.stepCounter++;
        this.openDialog();
      } else {
        this.stepCounter = 0;
      }
    });
  }
}
