import { DAG } from "@demo/core/pipeline/src/dag";
import { TaskNode } from "@demo/core/pipeline/src/nodes";
import { SetupConnectionTask } from "@demo/core";
import { IssueAyraW3CTask } from "../tasks/issueAyraW3CTask";
import { AgentController } from "@demo/core";

export default class IssueAcaPyW3CPipeline {
  _dag: DAG;
  _controller: AgentController;

  constructor(controller: AgentController) {
    this._controller = controller;
    this._dag = this._make(this._controller);
  }

  dag(): DAG {
    return this._dag;
  }

  async init() {
    // Controller initialization handled upstream
  }

  _make(controller: AgentController): DAG {
    const dag = new DAG("Ayra W3C (ACA-Py VC-API)");

    const setupConnectionTask = new SetupConnectionTask(
      controller,
      "Scan To Connect",
      "Establish DIDComm connection with the holder wallet"
    );
    const issueTask = new IssueAyraW3CTask(
      controller,
      "Issue Ayra Business Card (W3C)",
      "Issue and verify an Ayra Business Card as an LDP VC"
    );

    const connectionNode = new TaskNode(setupConnectionTask);
    dag.addNode(connectionNode);

    const issueNode = new TaskNode(issueTask);
    issueNode.addDependency(connectionNode);
    dag.addNode(issueNode);

    return dag;
  }
}
