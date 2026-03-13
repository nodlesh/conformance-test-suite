// Main exports for @demo/core package
export * from './core';
export * from './utils';
export * from './tasks';
export * from './controller';

// Re-export commonly used task classes at the root level for easier imports
export {
  SetupConnectionTask,
  RequestProofTask,
  ProposeProofTask,
  ReceiveConnectionTask,
  IssueCredentialTask,
  SelfIssueCredentialTask,
} from './tasks';

export type {
  RequestProofOptions,
  ProposeProofOptions,
  CredentialIssuanceOptions,
  SelfIssueCredentialOptions,
} from './tasks';
