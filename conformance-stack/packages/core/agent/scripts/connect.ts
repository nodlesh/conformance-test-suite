import { SetupConnectionTask } from "../tasks";
import { createAgentConfig } from "../utils";
import * as ngrok from "@ngrok/ngrok";

import { v4 } from "uuid";
import { BaseAgent } from "../core";
import { AgentController, CredoAgentAdapter } from "../controller";
const agentId = v4();
const port: number = Number(process.env.PORT) || 3033;

const run = async () => {
  const skipAgentNgrok = process.env.SKIP_AGENT_NGROK === "true";
  const token = process.env.NGROK_AUTH_TOKEN;

  let ngrokUrl: string;

  if (skipAgentNgrok) {
    console.log("[agent/connect] SKIP_AGENT_NGROK=true → not creating ngrok tunnel for agent");
    ngrokUrl = `http://localhost:${port}`;
  } else {
    if (!token) {
      throw new Error("NGROK_AUTH_TOKEN not set for agent ngrok connection");
    }
    const listener = await ngrok.connect({
      addr: port,
      proto: "http",
      authtoken: token,
    });
    const url = listener.url();
    if (!url) {
      throw new Error("ngrok failed to provide a public url for agent connection");
    }
    ngrokUrl = url;
  }

  const config = createAgentConfig("Agent", port, agentId, ngrokUrl, [ngrokUrl]);
  const agent = new BaseAgent(config);
  await agent.init();
  const controller = new AgentController(new CredoAgentAdapter(agent));
  const task = new SetupConnectionTask(controller, "Setup Agent Example");
  await task.prepare();
  console.log("prepared");
  await task.run();
  console.log("run");
};

// Execute the function and keep the script running until it completes
run()
  .then(() => {
    console.log("All jobs finished successfully.");
    process.exit(0); // Exit the process when done
  })
  .catch((err) => {
    console.error("An error occurred during execution:", err);
    process.exit(1); // Exit with an error code if something failed
  });
