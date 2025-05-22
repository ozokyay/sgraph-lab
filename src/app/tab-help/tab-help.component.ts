import { ApplicationRef, Component, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatDividerModule } from "@angular/material/divider";
import {
  DialogData,
  DialogTutorialComponent,
} from "../dialog-tutorial/dialog-tutorial.component";
import { MatDialog } from "@angular/material/dialog";
import { TutorialService } from "../tutorial.service";
import { ConfigurationService } from "../configuration.service";
import { EmptyInstance } from "../graph-configuration";
import { Utility } from "../utility";
import { ExampleGraph } from "../example-graph";
import { Cluster } from "../cluster";

@Component({
  selector: "app-tab-help",
  standalone: true,
  imports: [MatButtonModule, MatDividerModule, DialogTutorialComponent],
  templateUrl: "./tab-help.component.html",
  styleUrl: "./tab-help.component.css",
})
export class TabHelpComponent {
  public step!: DialogData;
  readonly dialog = inject(MatDialog);

  private stepCounter = 0;

  constructor(
    private config: ConfigurationService,
    private tutorial: TutorialService,
  ) {}

  public startTutorial() {
    // Import example graph
    this.config.ignoreChanges = true;
    this.config.clear();
    this.config.ignoreChanges = false;
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
          y: -1,
        };
        data = {
          title: "Welcome",
          text: "This tutorial will guide you through the steps for building a network with SGraph-Lab.",
          position: pos,
        };
        this.tutorial.primaryVisLevel.next(1);
        break;
      }

      case 1: {
        const rect = this.tutorial.tabClusterList.getBoundingClientRect();
        const pos = {
          x: rect.right + 10,
          y: rect.top + 150,
        };
        data = {
          title: "Community List",
          text: "The community list allows you to add and remove communities. Communities can have child communities.",
          position: pos,
        };
        this.tutorial.highlightClusterList = true;
        break;
      }

      case 2: {
        const rect = this.tutorial.visPrimary.getBoundingClientRect();
        const pos = {
          x: rect.left + 50,
          y: rect.top + 300,
        };
        data = {
          title: "Network Visualizations",
          text: "There are two views: The primary view in the center and the secondary view in the top left corner.",
          position: pos,
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
          y: rect.top + 100,
        };
        data = {
          title: "Adjacency Matrix",
          text: "The matrix provides an overlap-free visualization of the community connections all the time, which is especially useful when editing connections across levels in the community hierarchy.",
          position: pos,
        };
        this.tutorial.highlightPrimaryVis = false;
        break;
      }

      case 4: {
        const rect = this.tutorial.visPrimary.getBoundingClientRect();
        const pos = {
          x: rect.left + 100,
          y: rect.top + 400,
        };
        data = {
          title: "Node-Link Diagram",
          text: "The node link diagram shows communities as nodes and connections between them as edges.",
          position: pos,
        };
        this.tutorial.highlightPrimaryVis = true;
        this.tutorial.highlightSecondaryVis = false;
        break;
      }

      case 5: {
        const rect = this.tutorial.visPrimary.getBoundingClientRect();
        const pos = {
          x: rect.right - 560,
          y: rect.top + 80,
        };
        data = {
          title: "Levels",
          text: "Each view can independently show information about the graph at a depth in the community tree. The node-link diagram can also show the node level N.",
          position: pos,
        };
        this.tutorial.highlightPrimaryVis = false;
        this.tutorial.highlightPrimaryLevelVis = true;
        this.tutorial.primaryVisLevel.next(0);
        this.tutorial.secondaryVisLevel.next(2);
        this.tutorial.secondaryVisType.next("node-link");
        this.tutorial.update.next();
        break;
      }

      case 6: {
        const rect = this.tutorial.visPrimary.getBoundingClientRect();
        const pos = {
          x: rect.left + 50,
          y: rect.top + 300,
        };
        data = {
          title: "Node-Link Diagram",
          text: "You can click on a community in the list or in the node-link diagram at community level to select it.",
          position: pos,
        };
        this.tutorial.highlightPrimaryLevelVis = false;
        this.tutorial.secondaryVisLevel.next(2);
        this.tutorial.update.next();
        this.config.selectedCluster.next(
          this.config.configuration.value.definition.graph
            .getNodes()
            .find((n) => n.id == 6)!.data as Cluster,
        );
        break;
      }

      case 7: {
        const rect = this.tutorial.visPrimary.getBoundingClientRect();
        const pos = {
          x: rect.left + 10,
          y: rect.top + 150,
        };
        data = {
          title: "Node-Link Diagram",
          text: "There are different options for highlighting certain parts or encoding variables in the visualization. The egocentric layout is particiularly useful when inspecting or editing a community's connections to other community because it prevents overlap and hides other edges.",
          position: pos,
        };
        this.tutorial.primaryVisLevel.next(2);
        this.tutorial.highlightPrimaryOptions = true;
        this.tutorial.primaryCircular.next(true);
        break;
      }

      case 8: {
        const rect = this.tutorial.tabs.getBoundingClientRect();
        const pos = {
          x: rect.left - 600,
          y: rect.top + 200,
        };
        data = {
          title: "Community Properties",
          text: "In this tab, you configure a community. It can directly refer to a community in the final network which is created from a generator, or it can be a group with child communities. The replication factor determines how many instances are created from this definition. If the generator is set to 'Community Group', children must be added in the community tree.",
          position: pos,
        };
        this.tutorial.secondaryVisType.next("matrix");
        this.tutorial.highlightPrimaryOptions = false;
        this.tutorial.highlightTabs = true;
        this.config.activeTab.next(1);
        break;
      }

      case 9: {
        const rect = this.tutorial.tabs.getBoundingClientRect();
        const pos = {
          x: rect.left - 600,
          y: rect.top + 200,
        };
        data = {
          title: "Community Properties",
          text: "There are different graph generators to choose from. The configuration model and Chung-Lu model take a distribution of node degress as input. You can generate a distribution with the curve generator, draw it in the line chart, or define in the list of data points.",
          position: pos,
        };
        break;
      }

      case 10: {
        const rect = this.tutorial.tabs.getBoundingClientRect();
        const pos = {
          x: rect.left - 600,
          y: rect.top + 200,
        };
        data = {
          title: "Community Connections",
          text: "After selecting connections from the matrix or node-link diagram, you can configure them in this tab.",
          position: pos,
        };

        const cluster = this.config.selectedCluster.value;
        const node =
          this.config.configuration.value.definition.graph.nodeDictionary.get(
            cluster!.id,
          )!;
        const edges =
          this.config.configuration.value.definition.graph.nodes.get(node)!;
        this.config.selectedConnections.next([edges[0][0], edges[2][0]]);
        this.config.activeTab.next(2);
        break;
      }

      case 11: {
        const rect = this.tutorial.tabs.getBoundingClientRect();
        const pos = {
          x: rect.left - 600,
          y: rect.top + 200,
        };
        data = {
          title: "Graph Measures",
          text: "The measures tab provides more insight into the resulting graph.",
          position: pos,
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
          y: rect.top + 200,
        };
        data = {
          title: "Layout Settings",
          text: "Layout settings allow you to tune the force-directed layout algorithm. For example, you can use sampling for better performance or increase the gravity to pull communities closer together.",
          position: pos,
        };
        this.tutorial.primaryVisLevel.next(0);
        this.config.activeTab.next(4);
        break;
      }

      case 13: {
        const rect = this.tutorial.tabs.getBoundingClientRect();
        const pos = {
          x: rect.left - 600,
          y: rect.top + 200,
        };
        data = {
          title: "Diffusion Model",
          text: "You can select seed nodes and simulate how information spreads through your graph with different epidemic models.",
          position: pos,
        };
        this.config.activeTab.next(5);
        this.tutorial.primaryDiffusionMode.next(false);
        this.config.diffusionNodeStates.value.set(
          this.config.configuration.value.instance.graph.nodes[0],
          "infected",
        );
        this.config.diffusionNodeStates.next(
          this.config.diffusionNodeStates.value,
        );
        this.tutorial.playDiffusion.next();
        break;
      }

      case 14: {
        const rect = this.tutorial.tabs.getBoundingClientRect();
        const pos = {
          x: rect.left - 600,
          y: rect.top + 200,
        };
        data = {
          title: "Import/Export",
          text: "Here you can import or export your configuration and export the final graph.",
          position: pos,
        };
        this.config.activeTab.next(6);
        this.tutorial.primaryDiffusionMode.next(true);
        this.tutorial.stopDiffusion.next();
        break;
      }

      default: {
        const pos = {
          x: -1,
          y: -1,
        };
        data = {
          title: "Done",
          text: "Now you know how to build networks with SGraph-Lab!",
          position: pos,
        };
        done = true;
        this.tutorial.highlightTabs = false;
        this.config.ignoreChanges = true;
        this.config.clear();
        this.config.ignoreChanges = false;
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
      exitAnimationDuration: done ? undefined : 0,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (!done) {
        this.stepCounter++;
        this.openDialog();
      } else {
        this.stepCounter = 0;
      }
    });
  }
}
