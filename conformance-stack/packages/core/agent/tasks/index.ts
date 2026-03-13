import { SetupConnectionTask } from "./setup-connection";
import { RequestProofTask, RequestProofOptions } from "./request-proof";
import { ProposeProofTask, ProposeProofOptions } from "./propose-proof";
import { ReceiveConnectionTask } from "./receive-connection";

import {
  IssueCredentialTask,
  CredentialIssuanceOptions,
} from "./issue-credential";

import {
  SelfIssueCredentialTask,
  SelfIssueCredentialOptions,
} from "./self-issue-credential";

export {
  SetupConnectionTask,
  RequestProofTask,
  ProposeProofTask,
  ReceiveConnectionTask,
  IssueCredentialTask,
  SelfIssueCredentialTask,
};

export type {
  RequestProofOptions,
  ProposeProofOptions,
  CredentialIssuanceOptions,
  SelfIssueCredentialOptions,
};
