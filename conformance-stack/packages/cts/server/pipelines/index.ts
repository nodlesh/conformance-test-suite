import HolderTestPipeline from "./holderTestPipeline";
import VerifierTestPipeline from "./verifierTestPipeline";
import VerifierAcaPyPipeline from "./verifierAcaPyPipeline";
import TRQPTesterPipeline from "./trqpTesterPipeline";
import IssueCredentialPipeline from "./issueCredentialPipeline";
import RegistryTestPipeline from "./trqpTesterPipeline";
import IssueAcaPyW3CPipeline from "./issueAcaPyW3CPipeline";

export {
  HolderTestPipeline,
  VerifierTestPipeline,
  VerifierAcaPyPipeline,
  TRQPTesterPipeline,
  IssueCredentialPipeline,
  RegistryTestPipeline,
  IssueAcaPyW3CPipeline,
};

export enum PipelineType {
  HOLDER_TEST = "HOLDER_TEST",
  VERIFIER_TEST = "VERIFIER_TEST",
  ISSUER_TEST = "ISSUER_TEST",
  TRQP_TEST = "TRQP_TEST",
  REGISTRY_TEST = "REGISTRY_TEST"
}
