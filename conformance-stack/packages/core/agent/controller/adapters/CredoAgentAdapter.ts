import { v4 as uuidv4 } from "uuid";
import {
  AutoAcceptCredential,
  BaseEvent,
  ConnectionEventTypes,
  type ConnectionRecord,
  type ConnectionStateChangedEvent,
  CredentialEventTypes,
  CredentialPreviewAttributeOptions,
  CredentialState,
  type CredentialStateChangedEvent,
  HandshakeProtocol,
  KeyType,
  ProofEventTypes,
  ProofState,
  type ProofStateChangedEvent,
  TypedArrayEncoder,
} from "@credo-ts/core";
import {
  Observable,
  ReplaySubject,
  firstValueFrom,
  lastValueFrom,
} from "rxjs";
import { catchError, filter, map, take, timeout } from "rxjs/operators";
import {
  getUnqualifiedCredentialDefinitionId,
  getUnqualifiedSchemaId,
  parseIndyDid,
} from "@credo-ts/anoncreds";
import type { CredentialFormatPayload } from "@credo-ts/core/build/modules/credentials/formats";
import type { AnonCredsCredentialFormat } from "@credo-ts/anoncreds";
import type {
  GetCredentialDefinitionReturn,
  GetSchemaReturn,
} from "@credo-ts/anoncreds";

import { BaseAgent } from "../../core";
import type {
  AgentAdapter,
  ControllerConnectionRecord,
  ControllerInvitation,
  CredentialOfferPayload,
  CredentialOfferResult,
  ProofRequestPayload,
} from "../types";

export class CredoAgentAdapter implements AgentAdapter {
  constructor(private readonly agent: BaseAgent) {}

  private static decodeBase64Url(value: string): string {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return Buffer.from(padded, "base64").toString("utf8");
  }

  private static tryExtractOobFromInvitationUrl(invitationUrl: string): unknown | null {
    try {
      const url = new URL(invitationUrl);
      const encoded = url.searchParams.get("oob");
      if (!encoded) return null;
      const decoded = CredoAgentAdapter.decodeBase64Url(encoded);
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }

  private static isCredentialEvent(
    event: BaseEvent
  ): event is CredentialStateChangedEvent {
    return event?.type === CredentialEventTypes.CredentialStateChanged;
  }

  isReady(): boolean {
    return Boolean(this.agent?.agent?.isInitialized);
  }

  getLabel(): string {
    return this.agent.config?.label ?? "Credo Reference Agent";
  }

  async createOutOfBandInvitation(): Promise<ControllerInvitation> {
    const record = await this.agent.agent.oob.createInvitation({
      autoAcceptConnection: true,
      multiUseInvitation: false,
      // CTS only supports OOB + DIDExchange for establishing connections.
      // Legacy RFC0160 (connections/1.0) is intentionally not used.
      handshakeProtocols: [HandshakeProtocol.DidExchange],
    });
    const invitationUrl = record.outOfBandInvitation.toUrl({
      domain: this.agent.config?.domain ?? "",
    });
    const invitationJson =
      CredoAgentAdapter.tryExtractOobFromInvitationUrl(invitationUrl) ??
      (typeof (record as any)?.outOfBandInvitation?.toJSON === "function"
        ? (record as any).outOfBandInvitation.toJSON()
        : (record as any).outOfBandInvitation);
    return {
      id: record.id,
      url: invitationUrl,
      // For cross-agent interoperability, `raw` should be the invitation message itself.
      // CTS uses this to auto-post the invitation to the internal ACA-Py holder.
      raw: invitationJson,
    };
  }

  buildInvitationUrl(invitation: ControllerInvitation): string {
    return invitation.url;
  }

  async waitForConnection(invitation: ControllerInvitation): Promise<ControllerConnectionRecord> {
    const outOfBandId = invitation.id;
    if (!outOfBandId) {
      throw new Error("Out-of-band id missing for invitation");
    }
    const connectionRecord = await new Promise<ConnectionRecord>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `Timed out waiting for connection record for out-of-band id ${outOfBandId}`
          )
        );
      }, 300000);

      const handleConnection = (event: ConnectionStateChangedEvent) => {
        if (event.payload.connectionRecord.outOfBandId !== outOfBandId) {
          return;
        }
        cleanup();
        resolve(event.payload.connectionRecord);
      };

      const cleanup = () => {
        clearTimeout(timeoutId);
        this.agent.agent.events.off(
          ConnectionEventTypes.ConnectionStateChanged,
          handleConnection
        );
      };

      this.agent.agent.events.on(
        ConnectionEventTypes.ConnectionStateChanged,
        handleConnection
      );

      void this.agent.agent.connections
        .findAllByOutOfBandId(outOfBandId)
        .then(([connectionRecord]) => {
          if (connectionRecord) {
            cleanup();
            resolve(connectionRecord);
          }
        })
        .catch((err) => {
          cleanup();
          reject(err);
        });
    });
    return { id: connectionRecord.id, raw: connectionRecord };
  }

  async waitUntilConnected(connectionId: string): Promise<void> {
    await this.agent.agent.connections.returnWhenIsConnected(connectionId);
  }

  async getConnectionRecord(connectionId: string): Promise<ControllerConnectionRecord> {
    const record = await this.agent.agent.connections.getById(connectionId);
    return { id: record.id, raw: record };
  }

  async requestProofAndAccept(
    connectionId: string,
    proof: ProofRequestPayload
  ): Promise<void> {
    const parentThreadId = uuidv4();
    const proofRecordPromise = this.waitForProofExchangeRecord({
      parentThreadId,
      state: ProofState.PresentationReceived,
    });
    // Avoid unhandled promise rejections if `requestProof` throws before we can await.
    void proofRecordPromise.catch(() => undefined);

    const protocolVersion = proof.protocolVersion ?? "v2";
    if (protocolVersion !== "v2") {
      throw new Error(
        `Credo adapter currently supports only proof protocol version v2 (received ${protocolVersion})`
      );
    }

    await this.agent.agent.proofs.requestProof({
      connectionId,
      parentThreadId,
      protocolVersion,
      proofFormats: proof.proofFormats,
    });

    const proofRecord = await proofRecordPromise;
    await this.agent.agent.proofs.acceptPresentation({
      proofRecordId: proofRecord.id,
    });

    return;
  }

  async issueCredential(payload: CredentialOfferPayload): Promise<CredentialOfferResult> {
    if (!payload.connectionId) {
      throw new Error("connectionId is required to issue a credential");
    }
    if (!payload.issuerDid) {
      throw new Error("issuerDid is required to issue a credential");
    }
    if (!payload.attributes?.length) {
      throw new Error("At least one attribute is required to issue a credential");
    }

    const { namespaceIdentifier } = parseIndyDid(payload.issuerDid);
    await this.ensureIssuerDid(payload.issuerDid, payload.didSeed);
    let schemaSeqNo: number | undefined;
    let ensuredSchemaId = payload.schemaId;
    let legacySchemaId: string | undefined;

    if (!ensuredSchemaId) {
      if (!payload.schemaTemplate) {
        throw new Error(
          "schemaTemplate is required when schemaId is not provided for credential issuance"
        );
      }
      const schemaTemplate = {
        ...payload.schemaTemplate,
        issuerId: payload.issuerDid,
      };
      const schemaResult =
        await this.agent.agent.modules.anoncreds.registerSchema({
          schema: schemaTemplate,
          options: {
            supportRevocation: false,
            endorserMode: "internal",
            endorserDid: payload.issuerDid,
          },
        });
      if (schemaResult?.schemaState.state === "failed") {
        throw new Error(
          `Error creating schema: ${schemaResult.schemaState.reason}`
        );
      }
      ensuredSchemaId = schemaResult.schemaState.schemaId;
      if (!ensuredSchemaId) {
        throw new Error("Schema registration did not return an id");
      }
      const registeredSeqNo =
        schemaResult.schemaMetadata?.indyLedgerSeqNo ??
        schemaResult.schemaState?.schemaMetadata?.indyLedgerSeqNo;
      if (typeof registeredSeqNo === "number") {
        schemaSeqNo = registeredSeqNo;
      }
      legacySchemaId = getUnqualifiedSchemaId(
        namespaceIdentifier,
        schemaTemplate.name,
        schemaTemplate.version
      );
    } else {
      const schemaLedgerRecord = await this.waitForLedgerSchema(ensuredSchemaId);
      const schemaLedgerInfo = schemaLedgerRecord?.schema;
      if (
        typeof schemaLedgerRecord?.schemaMetadata?.indyLedgerSeqNo === "number"
      ) {
        schemaSeqNo = schemaLedgerRecord.schemaMetadata.indyLedgerSeqNo;
      }
      if (schemaLedgerInfo) {
        legacySchemaId = getUnqualifiedSchemaId(
          namespaceIdentifier,
          schemaLedgerInfo.name,
          schemaLedgerInfo.version
        );
      }
    }

    if (typeof schemaSeqNo !== "number") {
      throw new Error("Unable to determine schema sequence number on ledger");
    }

    let ensuredCredDefId = payload.credentialDefinitionId;
    let legacyCredentialDefinitionId: string | undefined;
    const credentialDefinitionTag = payload.credentialDefinitionTag ?? "ayra-card";
    if (!ensuredCredDefId) {
      const { credentialDefinitionState } =
        await this.agent.agent.modules.anoncreds.registerCredentialDefinition({
          credentialDefinition: {
            schemaId: ensuredSchemaId,
            issuerId: payload.issuerDid,
            tag: credentialDefinitionTag,
          },
          options: {
            supportRevocation: false,
            endorserMode: "internal",
            endorserDid: payload.issuerDid,
          },
        });

      if (credentialDefinitionState.state !== "finished") {
        throw new Error(
          `Error registering credential definition: ${
            credentialDefinitionState.state === "failed"
              ? credentialDefinitionState.reason
              : "Not Finished"
          }}`
        );
      }
      ensuredCredDefId = credentialDefinitionState.credentialDefinitionId;
      if (!ensuredCredDefId) {
        throw new Error(
          "Credential definition registration did not return an id"
        );
      }
      await this.waitForLedgerCredentialDefinition(ensuredCredDefId);
      legacyCredentialDefinitionId = getUnqualifiedCredentialDefinitionId(
        namespaceIdentifier,
        schemaSeqNo,
        credentialDefinitionTag
      );
    } else {
      await this.waitForLedgerCredentialDefinition(ensuredCredDefId);
      legacyCredentialDefinitionId = ensuredCredDefId;
    }

    const effectiveCredentialDefinitionId =
      legacyCredentialDefinitionId ?? ensuredCredDefId;

    const offerAttributes =
      payload.attributes as CredentialPreviewAttributeOptions[];
    const credentialFormats: CredentialFormatPayload<
      [AnonCredsCredentialFormat],
      "createOffer"
    > = {
      anoncreds: {
        attributes: offerAttributes,
        credentialDefinitionId: effectiveCredentialDefinitionId,
      },
    };
    const offerCredState = await (this.agent.agent.credentials
      .offerCredential as any)({
      connectionId: payload.connectionId,
      protocolVersion: "v2",
      credentialFormats,
    });

    const credentialRecord = await this.waitForCredentialRecord({
      state: CredentialState.RequestReceived,
      threadId: offerCredState.threadId,
    });

    const recordAccept = await this.agent.agent.credentials.acceptRequest({
      credentialRecordId: offerCredState.id,
      autoAcceptCredential: AutoAcceptCredential.Always,
    });

    return {
      schemaId: ensuredSchemaId,
      legacySchemaId,
      credentialDefinitionId: ensuredCredDefId,
      legacyCredentialDefinitionId: legacyCredentialDefinitionId,
      record: recordAccept ?? credentialRecord,
    };
  }

  private waitForProofExchangeRecord(options: {
    parentThreadId: string;
    state: ProofState;
    timeoutMs?: number;
  }): Promise<any> {
    const observable = this.agent.agent.events.observable<ProofStateChangedEvent>(
      ProofEventTypes.ProofStateChanged
    );

    return this.waitForProofExchangeRecordSubject(observable, options);
  }

  private waitForProofExchangeRecordSubject(
    subject: ReplaySubject<any> | Observable<any>,
    {
      parentThreadId,
      state,
      timeoutMs = 120000,
    }: {
      parentThreadId: string;
      state: ProofState;
      timeoutMs?: number;
    }
  ): Promise<any> {
    const observable: Observable<any> =
      subject instanceof ReplaySubject ? subject.asObservable() : subject;

    return lastValueFrom(
      observable.pipe(
        filter(
          (event): event is ProofStateChangedEvent =>
            event?.type === ProofEventTypes.ProofStateChanged
        ),
        filter(
          (event) =>
            event.payload.proofRecord.parentThreadId === parentThreadId
        ),
        filter((event) => event.payload.proofRecord.state === state),
        timeout(timeoutMs),
        take(1),
        map((event) => event.payload.proofRecord),
        catchError((err) => {
          throw new Error(
            `ProofStateChangedEvent not emitted within ${timeoutMs}ms for parentThreadId ${parentThreadId}: ${err}`
          );
        })
      )
    );
  }

  private async ensureIssuerDid(did: string, seed?: string) {
    if (!seed) {
      return;
    }
    try {
      await this.agent.agent.dids.import({
        did,
        overwrite: true,
        privateKeys: [
          {
            keyType: KeyType.Ed25519,
            privateKey: TypedArrayEncoder.fromString(seed),
          },
        ],
      });
    } catch (error) {
      console.warn(`[CredoAgentAdapter] Failed to import DID ${did}:`, error);
    }
  }

  private waitForCredentialRecord(options: {
    threadId?: string;
    state?: CredentialState;
    previousState?: CredentialState | null;
    timeoutMs?: number;
  }): Promise<any> {
    const observable =
      this.agent.agent.events.observable<CredentialStateChangedEvent>(
        CredentialEventTypes.CredentialStateChanged
      );
    return this.waitForCredentialRecordSubject(observable, options);
  }

  private waitForCredentialRecordSubject(
    subject: ReplaySubject<BaseEvent> | Observable<BaseEvent>,
    {
      threadId,
      state,
      previousState,
      timeoutMs = 15000,
    }: {
      threadId?: string;
      state?: CredentialState;
      previousState?: CredentialState | null;
      timeoutMs?: number;
    }
  ) {
    const observable: Observable<BaseEvent> =
      subject instanceof ReplaySubject ? subject.asObservable() : subject;

    return firstValueFrom(
      observable.pipe(
        filter(CredoAgentAdapter.isCredentialEvent),
        filter(
          (e) =>
            previousState === undefined ||
            e.payload.previousState === previousState
        ),
        filter(
          (e) =>
            threadId === undefined ||
            e.payload.credentialRecord.threadId === threadId
        ),
        filter(
          (e) =>
            state === undefined || e.payload.credentialRecord.state === state
        ),
        timeout(timeoutMs),
        catchError(() => {
          throw new Error(
            `CredentialStateChanged event not emitted within specified timeout: {
  previousState: ${previousState},
  threadId: ${threadId},
  state: ${state}
}`
          );
        }),
        map((e) => e.payload.credentialRecord)
      )
    );
  }

  private async waitForLedgerSchema(
    schemaId: string,
    timeoutMs = 30000
  ): Promise<GetSchemaReturn> {
    return this.pollLedger<GetSchemaReturn>(
      () => this.agent.agent.modules.anoncreds.getSchema({ schemaId }),
      `schema ${schemaId}`,
      timeoutMs
    );
  }

  private async waitForLedgerCredentialDefinition(
    credentialDefinitionId: string,
    timeoutMs = 30000
  ): Promise<GetCredentialDefinitionReturn> {
    return this.pollLedger<GetCredentialDefinitionReturn>(
      () =>
        this.agent.agent.modules.anoncreds.getCredentialDefinition({
          credentialDefinitionId,
        }),
      `credential definition ${credentialDefinitionId}`,
      timeoutMs
    );
  }

  private async pollLedger<T>(
    fetcher: () => Promise<T>,
    description: string,
    timeoutMs: number
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    let attempt = 0;
    while (Date.now() < deadline) {
      attempt += 1;
      try {
        const result = await fetcher();
        if (attempt > 1) {
          console.log(
            `Retrieved ${description} from ledger after ${attempt} attempts`
          );
        }
        return result;
      } catch (error) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    throw new Error(
      `Timed out waiting for ${description} to be available on the ledger`
    );
  }
}
