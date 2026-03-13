import { createAgentConfig } from "../utils";
import { BaseAgent } from "../core";
import { v4 } from "uuid";
const agentId = v4();
const port: number = Number(process.env.PORT) || 3033;
import * as ngrok from "@ngrok/ngrok";

const run = async () => {
  const listener = await ngrok.connect({
    addr: port,
    proto: "http",
    authtoken: process.env.NGROK_AUTH_TOKEN, // If you have an ngrok account
  });
  const ngrokUrl = listener.url();
  if (!ngrokUrl) {
    throw new Error("ngrok failed to provide a public url");
  }
  const config = createAgentConfig("Agent", port, agentId, ngrokUrl, [
    ngrokUrl,
  ]);
  const agent = new BaseAgent(config);
  await agent.init();

  const did = await agent.agent.dids.create({
    method: "key",
    options: {
      keyType: "ed25519",
    },
  });
  console.log("DID created:", did);

  const schemaResult = await agent.agent.modules.anoncreds.registerSchema({
    schema: {
      attrNames: ["name"],
      issuerId: did,
      name: "Example Schema to register",
      version: "1.0.0",
    },
    options: {},
  });

  const credentialDefinitionResult =
    await agent.agent.modules.anoncreds.registerCredentialDefinition({
      credentialDefinition: {
        tag: "default",
        issuerId: did,
        schemaId: schemaResult.schemaState.schemaId,
      },
      options: {
        supportRevocation: false,
      },
    });

  if (credentialDefinitionResult.credentialDefinitionState.state === "failed") {
    throw new Error(
      `Error creating credential definition: ${credentialDefinitionResult.credentialDefinitionState.reason}`
    );
  }
  if (schemaResult.schemaState.state === "failed") {
    throw new Error(
      `Error creating schema: ${schemaResult.schemaState.reason}`
    );
  }
};

run()
  .then(() => {
    console.log("All jobs finished successfully.");
    process.exit(0); // Exit the process when done
  })
  .catch((err) => {
    console.error("An error occurred during execution:", err);
    process.exit(1); // Exit with an error code if something failed
  });
