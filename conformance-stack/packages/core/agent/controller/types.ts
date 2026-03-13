import type { CredentialPreviewAttributeOptions } from "@credo-ts/core";
import type { RequestProofOptions } from "../tasks/request-proof";

export type ProofRequestPayload = RequestProofOptions["proof"];

export type ControllerInvitation = {
  id?: string;
  outOfBandId?: string;
  url: string;
  raw?: unknown;
};

export type ControllerConnectionRecord = {
  id: string;
  raw?: unknown;
};

export type ConnectionInitResult = {
  invitation: ControllerInvitation;
  invitationUrl: string;
  connectionRecordPromise: Promise<ControllerConnectionRecord>;
};

export type CredentialAttribute = CredentialPreviewAttributeOptions;

export type CredentialSchemaTemplate = {
  name: string;
  version: string;
  attrNames: string[];
};

export type CredentialOfferPayload = {
  connectionId: string;
  issuerDid: string;
  didSeed?: string;
  schemaTemplate?: CredentialSchemaTemplate;
  schemaId?: string;
  credentialDefinitionId?: string;
  credentialDefinitionTag?: string;
  attributes: CredentialAttribute[];
};

export type CredentialOfferResult = {
  schemaId?: string;
  legacySchemaId?: string;
  credentialDefinitionId: string;
  legacyCredentialDefinitionId?: string;
  record?: unknown;
};

export interface AgentAdapter {
  isReady(): boolean;
  getLabel(): string;
  createOutOfBandInvitation(): Promise<ControllerInvitation>;
  buildInvitationUrl(invitation: ControllerInvitation): string;
  waitForConnection(invitation: ControllerInvitation): Promise<ControllerConnectionRecord>;
  waitUntilConnected(connectionId: string): Promise<void>;
  getConnectionRecord?(connectionId: string): Promise<ControllerConnectionRecord>;
  requestProofAndAccept(connectionId: string, proof: ProofRequestPayload): Promise<void>;
  issueCredential(payload: CredentialOfferPayload): Promise<CredentialOfferResult>;
  shutdown?(): Promise<void>;
}
