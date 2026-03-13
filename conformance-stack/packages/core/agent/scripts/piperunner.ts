import {
  SetupConnectionTask,
  RequestProofTask,
  RequestProofOptions,
} from "../tasks";
import { createAgentConfig } from "../utils";
import * as ngrok from "@ngrok/ngrok";
import { DAG } from "../../pipeline/src/dag";
import { TaskNode } from "../../pipeline/src/nodes";

import { v4 } from "uuid";
import { BaseAgent } from "../core";
import { AgentController, CredoAgentAdapter } from "../controller";
import { RunnableState } from "../../pipeline/src/types";
const agentId = v4();
import { Server as SocketIOServer } from "socket.io";

const port: number = Number(process.env.PORT) || 3001;
const serverPort: number = Number(process.env.PORT) || 3000;

const schemaId = "H7W22uhD4ueQdGaGeiCgaM:2:student id:1.0.0";
import http from "http";

import express from "express";
import cors from "cors";

// Initialize DAG
const dag = new DAG("Posted Worker Pipeline");

const run = async () => {
  const dag = new DAG("Pipeline");
  const listener = await ngrok.connect({
    addr: serverPort,
    proto: "http",
    authtoken: process.env.NGROK_AUTH_TOKEN, // If you have an ngrok account
  });
  const ngrokUrl = listener.url();
  if (!ngrokUrl) {
    throw new Error("ngrok failed to provide a public url");
  }
  const config = createAgentConfig("Agent", serverPort, agentId, ngrokUrl, [
    ngrokUrl,
  ]);

  const agent = new BaseAgent(config);
  await agent.init();

  const controller = new AgentController(new CredoAgentAdapter(agent));

  const task = new SetupConnectionTask(
    controller,
    "Setup Connection Example",
    "Set a didcomm connection between GAN Verifier App and Holder"
  );

  const proof = {
    protocolVersion: "v1",
    proofFormats: {
      indy: {
        name: "proof-request",
        nonce: "1234567890",
        version: "1.0",
        requested_attributes: {
          studentInfo: {
            names: ["given_names", "family_name"],
            restrictions: [
              {
                schema_name: "student id",
              },
            ],
          },
        },
        requested_predicates: {},
      },
    },
  };

  const requestProofOptions: RequestProofOptions = {
    proof: proof,
    checkGANTR: false,
    checkTrustRegistry: false
  };
  const requestProof = new RequestProofTask(
    controller,
    { ...requestProofOptions, checkGANTR: true },
    "Request Posted Worker Notification",
    "Request Posted Worker Notification"
  );

  const requestRightToWorkProof = new RequestProofTask(
    controller,
    requestProofOptions,
    "Request Right To Work",
    "Request Right To Work"
  );

  const requestRightToWorkInCountry = new RequestProofTask(
    controller,
    requestProofOptions,
    "Request Right To Work In Country",
    "Request Right To Work In Country"
  );

  const connectionNode = new TaskNode(task);
  dag.addNode(connectionNode);
  const rpNode = new TaskNode(requestProof);
  rpNode.addDependency(connectionNode);
  const rpNode2 = new TaskNode(requestProof);
  rpNode2.addDependency(connectionNode);
  const rpNode3 = new TaskNode(requestProof);
  rpNode3.addDependency(connectionNode);
  await dag.start();

  // go through all nodes

  var allPassed = true;
  dag.getNodes().forEach((node) => {
    console.log(
      "checking status of ",
      node.task.metadata.name,
      node.task.state.status
    );
    if (node.task.state.status !== RunnableState.ACCEPTED) {
      allPassed = false;
    }
  });

  console.log("FINAL Results...");
  console.log(allPassed);
  console.log("--------");
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
