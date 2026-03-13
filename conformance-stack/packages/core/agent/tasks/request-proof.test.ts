import { SetupConnectionTask } from "./setup-connection";
import { BaseAgent } from "../core";
import { AgentController, CredoAgentAdapter } from "../controller";
import { v4 } from "uuid";
import { createAgentConfig } from "../utils";

describe("RequestProof", () => {
  let verifierAgent: BaseAgent;
  let holderAgent: BaseAgent | undefined;
  let issuerAgent: BaseAgent | undefined;

  const basePort = 3020;
  const verifierConfig = createAgentConfig(
    "Verifier Agent",
    basePort,
    v4(),
    `http://127.0.0.1:${basePort}`
  );
  const holderConfig = createAgentConfig(
    "Holder Agent",
    basePort + 1,
    v4(),
    `http://127.0.0.1:${basePort + 1}`
  );

  beforeEach(() => {
    verifierAgent = new BaseAgent(verifierConfig);
    holderAgent = new BaseAgent(holderConfig);
  });
  afterEach(async () => {
    for (const agent of [holderAgent, issuerAgent]) {
      if (agent) {
        try {
          await agent?.agent.shutdown();
          await agent?.agent.wallet.delete();
        } catch (e) {
          console.error("Error during cleanup:", e);
        }
      }
    }
  });

  it("request-proof -- should initialize the agent correctly", async () => {
    await verifierAgent.init();
    await holderAgent?.init();

    const holderActions = async () => {
      while (setupConnectionTask.invitation === undefined) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await holderAgent?.agent.oob.receiveInvitation(
        setupConnectionTask.invitation.outOfBandInvitation
      );
    };

    const controller = new AgentController(new CredoAgentAdapter(verifierAgent));
    const setupConnectionTask = new SetupConnectionTask(
      controller,
      "Setup Connection",
      "Setup Connection Task"
    );

    holderActions();
    await setupConnectionTask.prepare();
    await setupConnectionTask.run();
    const results = await setupConnectionTask.results();
    expect(results).toBeDefined();
  });
});
