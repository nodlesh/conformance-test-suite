import BaseRunnableTask from "../../pipeline/src/tasks/baseRunnableTask";
import { RunnableState, Results } from "../../pipeline/src/types";
import { AgentController } from "../controller";
import qrcord from "qrcode-terminal";
import eventEmitter from "../utils/eventEmitter";
import type { ControllerConnectionRecord, ControllerInvitation } from "../controller/types";

export class SetupConnectionTask extends BaseRunnableTask {
  private controller: AgentController;
  private _oobInvitation: ControllerInvitation | undefined;
  private _connectionRecord: ControllerConnectionRecord | undefined;

  constructor(controller: AgentController, name: string, description?: string) {
    super(name, description);
    this.controller = controller;
  }

  async prepare(): Promise<void> {
    super.prepare();
    if (!this.controller) {
      super.addError("controller wasn't defined");
      throw new Error("Agent controller is not defined");
    }
    if (this.controller.isReady()) {
      this.addMessage("Agent is initialized");
    }
  }

  get invitation(): ControllerInvitation | undefined {
    return this._oobInvitation;
  }

  async run(): Promise<void> {
    super.run();
    if (!this.controller) {
      super.addError("controller wasn't defined");
      throw new Error("Agent controller is not defined");
    }
    this.addMessage("Initializing controller");

    const { invitation, invitationUrl, connectionRecordPromise } =
      await this.controller.establishConnection();
    this._oobInvitation = invitation;
    eventEmitter.emit("invitation", invitation.url);
    console.log("Invitation URL:\n", invitationUrl);
    qrcord.generate(invitationUrl, { small: true });

    this.setRunState(RunnableState.PENDING);
    this.setStatus(RunnableState.PENDING);

    const connectionRecord = await connectionRecordPromise;
    this._connectionRecord = connectionRecord;

    this.setCompleted();
    this.setAccepted();
    console.log("Connection established");
    console.log("Returning...");
  }

  async results(): Promise<Results> {
    return {
      value: this._connectionRecord,
      time: new Date(),
      author: this.controller.label,
    } as Results;
  }
}
