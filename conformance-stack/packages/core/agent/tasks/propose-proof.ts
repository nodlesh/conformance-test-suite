import { Observable, firstValueFrom, lastValueFrom } from "rxjs";
import BaseRunnableTask from "../../pipeline/src/tasks/baseRunnableTask";
import { filter, timeout, catchError, take, map, tap } from "rxjs/operators";
import { v4 } from "uuid";
import {
  Agent,
  BaseEvent,
  ConnectionRecord,
  ProofExchangeRecord,
  ProofEventTypes,
  ProofState,
  ProofStateChangedEvent,
  ConnectionEventTypes,
  ConnectionStateChangedEvent,
  ConnectionDidRotatedEvent,
  TrustPingEventTypes,
  AgentEventTypes,
  AgentMessageProcessedEvent,
  TrustPingReceivedEvent,
  TrustPingResponseReceivedEvent,
} from "@credo-ts/core";
import { ReplaySubject } from "rxjs";
import { Results, RunnableState } from "../../pipeline/src/types";
import { BaseAgent } from "../core";

type ProposeProofOptionsWithoutConnectionId = {
  connectionId?: string;
  proofFormats: any;
  protocolVersion?: string;
};

export type ProposeProofOptions = {
  proof: ProposeProofOptionsWithoutConnectionId;
};

const isProofStateChangedEvent = (e: BaseEvent): e is ProofStateChangedEvent =>
  e.type === ProofEventTypes.ProofStateChanged;
const isConnectionStateChangedEvent = (
  e: BaseEvent
): e is ConnectionStateChangedEvent =>
  e.type === ConnectionEventTypes.ConnectionStateChanged;
const isConnectionDidRotatedEvent = (
  e: BaseEvent
): e is ConnectionDidRotatedEvent =>
  e.type === ConnectionEventTypes.ConnectionDidRotated;
const isTrustPingReceivedEvent = (e: BaseEvent): e is TrustPingReceivedEvent =>
  e.type === TrustPingEventTypes.TrustPingReceivedEvent;
const isTrustPingResponseReceivedEvent = (
  e: BaseEvent
): e is TrustPingResponseReceivedEvent =>
  e.type === TrustPingEventTypes.TrustPingResponseReceivedEvent;
const isAgentMessageProcessedEvent = (
  e: BaseEvent
): e is AgentMessageProcessedEvent =>
  e.type === AgentEventTypes.AgentMessageProcessed;

export class ProposeProofTask extends BaseRunnableTask {
  private _agent: BaseAgent;
  private result: RunnableState;
  private _options: ProposeProofOptions;

  constructor(
    agent: BaseAgent,
    options: ProposeProofOptions,
    name: string,
    description?: string
  ) {
    super(name, description);
    this._agent = agent;
    this._options = options;
    this.result = RunnableState.NOT_STARTED;
  }

  async prepare(): Promise<void> {
    super.prepare();
    if (!this._agent) {
      super.addError("agent wasn't defined");
      throw new Error("Agent is not defined");
    }
    if (this._agent?.agent.isInitialized) {
      this.addMessage("Agent is initialized");
    }
  }

  async run(connectionRecord?: any): Promise<void> {
    super.run();
    try {
      if (!connectionRecord) {
        this.addError("Connection record is required");
        throw new Error("Connection record is required");
      }

      const record = connectionRecord as ConnectionRecord;
      const connectionId = record?.id;

      if (!connectionId) {
        this.addError("Connection ID is required");
        throw new Error("Connection ID is required");
      }

      const connStr = connectionId as string;
      if (!this._agent) {
        this.addError("agent wasn't defined");
        throw new Error("Agent is not defined");
      }
      this.addMessage("Initializing agent");

      const parentThreadId = v4();
      const waitForProofExchange = this.waitForProofExchangeRecord2(
        this._agent.agent,
        {
          parentThreadId,
          state: ProofState.ProposalSent,
        }
      );

      console.log("Proposing proof", connStr);
      const exchangeRecord = await this._agent.agent.proofs.proposeProof({
        protocolVersion: "v2",
        connectionId: connStr,
        parentThreadId,
        proofFormats: this._options.proof.proofFormats,
      });

      console.log("Waiting for proposal exchange", exchangeRecord);
      const pe2 = await waitForProofExchange;

      console.log("Proposal sent:", pe2);
      this.setCompleted();
      this.setAccepted();
    } catch (e) {
      console.error(e);
      this.addError(e);
      this.setCompleted();
      this.setFailed();
      throw e;
    }
  }

  async results(): Promise<Results> {
    return {
      time: new Date(),
      author: "ProposeProofTask",
      value: {
        message: "Proof proposal completed successfully",
        state: this.state,
      },
    };
  }

  waitForProofExchangeRecord2(
    agent: Agent,
    options: {
      threadId?: string;
      parentThreadId?: string;
      state?: ProofState;
      previousState?: ProofState | null;
      timeoutMs?: number;
    }
  ) {
    const observable = agent.events.observable<ProofStateChangedEvent>(
      ProofEventTypes.ProofStateChanged
    );

    return this.waitForProofExchangeRecordSubject2(observable, options);
  }

  waitForProofExchangeRecordSubject2(
    subject: ReplaySubject<BaseEvent> | Observable<BaseEvent>,
    {
      threadId,
      parentThreadId,
      state,
      previousState,
      timeoutMs = 1000000,
      count = 1,
    }: {
      threadId?: string;
      parentThreadId?: string;
      state?: ProofState;
      previousState?: ProofState | null;
      timeoutMs?: number;
      count?: number;
    }
  ) {
    const observable: Observable<BaseEvent> =
      subject instanceof ReplaySubject ? subject.asObservable() : subject;
    return lastValueFrom(
      observable.pipe(
        filter(isProofStateChangedEvent),
        filter(
          (e) =>
            previousState === undefined ||
            e.payload.previousState === previousState
        ),
        filter(
          (e) =>
            threadId === undefined ||
            e.payload.proofRecord.threadId === threadId
        ),
        filter(
          (e) =>
            parentThreadId === undefined ||
            e.payload.proofRecord.parentThreadId === parentThreadId
        ),
        filter(
          (e) => state === undefined || e.payload.proofRecord.state === state
        ),
        timeout(timeoutMs),
        catchError(() => {
          throw new Error(
            `ProofStateChangedEvent event not emitted within specified timeout: ${timeoutMs}
          previousState: ${previousState},
          threadId: ${threadId},
          parentThreadId: ${parentThreadId},
          state: ${state}
        }`
          );
        }),
        take(count),
        map((e) => e.payload.proofRecord)
      )
    );
  }
} 