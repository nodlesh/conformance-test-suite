import { IssueCredentialTask } from "./issue-credential";
import type { AgentController } from "../controller";
import type { CredentialOfferResult } from "../controller/types";

describe("IssueCredentialTask", () => {
  const mockResult: CredentialOfferResult = {
    schemaId: "schema-id",
    legacySchemaId: "legacy-schema-id",
    credentialDefinitionId: "cred-def-id",
    legacyCredentialDefinitionId: "legacy-cred-def-id",
  };

  const createController = () =>
    ({
      isReady: () => true,
      issueCredential: jest.fn().mockResolvedValue(mockResult),
    }) as unknown as AgentController;

  it("invokes controller.issueCredential with schema template when schemaId not provided", async () => {
    const controller = createController();
    const task = new IssueCredentialTask(
      controller,
      { did: "did:indy:bcovrin:test:HYfhCRaKhccZtr7v8CHTe8" },
      "Issue Credential"
    );
    await task.prepare();
    await task.run({ id: "connection-id" });
    expect(controller.issueCredential).toHaveBeenCalledTimes(1);
    const payload = (controller.issueCredential as jest.Mock).mock.calls[0][0];
    expect(payload.connectionId).toEqual("connection-id");
    expect(payload.schemaTemplate?.name).toContain("AyraCard");
    const results = await task.results();
    expect(results.value.result).toEqual(mockResult);
  });
});
