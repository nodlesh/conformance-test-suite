import { BaseAgent } from "../core";
import qrcord from "qrcode-terminal";
import * as ngrok from "@ngrok/ngrok";

import { createAgentConfig } from "../utils";
import {
  Agent,
  OutOfBandRecord,
  DidExchangeState,
  ConnectionRecord,
  ConnectionStateChangedEvent,
  ConnectionEventTypes,
} from "@credo-ts/core";

import { v4 } from "uuid";

const agentId = v4();
const port: number = Number(process.env.PORT) || 3033;

const run = async () => {
  try {
    const listener = await ngrok.connect({
      addr: port, // The port to tunnel
      proto: "http", // http or https
      authtoken: process.env.NGROK_AUTH_TOKEN, // If you have an ngrok account
    });
    const ngrokUrl = listener.url();
    if (!ngrokUrl) {
      throw new Error("ngrok failed to provide a public url");
    }
    // Start ngrok
    // Use the ngrok URL in the config
    const config = createAgentConfig("Agent", port, agentId, ngrokUrl, [
      ngrokUrl,
    ]);
    const agent = new BaseAgent(config);

    // Initialize the agent
    await agent.init();

    // Create an out-of-band invitation
    const outOfBandRecord = await agent.agent.oob.createInvitation();
    const outOfBandInvitation = outOfBandRecord.outOfBandInvitation;
    const oobId = outOfBandRecord.id;
    if (!outOfBandInvitation) {
      throw new Error("Out-of-band invitation was not created");
    }

    const urlMessage = outOfBandInvitation.toUrl({
      domain: ngrokUrl, // Use ngrok URL here as the domain
    });

    console.log("Verifier OOB Invitation URL:\n", urlMessage);
    qrcord.generate(urlMessage, { small: true });

    // Retrieve connection record
    const verifierConnectionTmp = await getConnectionRecord(agent.agent, oobId);

    console.log("Verifier connection record:", verifierConnectionTmp);
    const verifierConnection =
      await agent.agent.connections.returnWhenIsConnected(
        verifierConnectionTmp!.id
      );
    console.log("Verifier connection established:", verifierConnection);
  } catch (error) {
    console.error("Error initializing agent:", error);
  } finally {
    //    await agent.shutdown();
    await ngrok.disconnect(); // Close ngrok tunnel
  }
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

const setupConnectionListener = async (
  agent: Agent,
  outOfBandRecord: OutOfBandRecord,
  cb: (...args: any) => void
) => {
  agent.events.on<ConnectionStateChangedEvent>(
    ConnectionEventTypes.ConnectionStateChanged,
    ({ payload }) => {
      console.log("Connection state changed:", payload.connectionRecord);
      if (payload.connectionRecord.outOfBandId !== outOfBandRecord.id) return;
      if (payload.connectionRecord.state === DidExchangeState.Completed) {
        console.log(
          `Connection for out-of-band id ${outOfBandRecord.id} completed`
        );

        console.log("Connection record:", payload.connectionRecord);
        cb();
      }
    }
  );
};

const getConnectionRecord = (agent: Agent, outOfBandId: string) =>
  new Promise<ConnectionRecord>((resolve, reject) => {
    console.log("agent...");
    console.log("getting connection record");
    const timeoutId = setTimeout(
      () => reject(new Error("missing connection record")),
      50000
    );

    console.log("set timeout");
    console.log("waiting for state change");

    agent.events.on<ConnectionStateChangedEvent>(
      ConnectionEventTypes.ConnectionStateChanged,
      (e) => {
        console.log("got event");
        if (e.payload.connectionRecord.outOfBandId !== outOfBandId) return;

        clearTimeout(timeoutId);
        resolve(e.payload.connectionRecord);
        console.log("getting connection record");
      }
    );

    // Also retrieve the connection record by invitation if the event has already fired
    void agent.connections
      .findAllByOutOfBandId(outOfBandId)
      .then(([connectionRecord]) => {
        console.log("getting connection record by invitation");
        if (connectionRecord) {
          clearTimeout(timeoutId);
          resolve(connectionRecord);
        }
      });
  });
