import { WaitForVerificationViaAcaPyTask } from "../packages/cts/server/pipelines/verifierAcaPyPipeline";

const makeResponse = (body: any, ok = true, status = 200) => ({
  ok,
  status,
  statusText: ok ? "OK" : "Not Found",
  headers: {
    get: () => "application/json",
  },
  json: async () => body,
  text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
});

const makeAdapter = () =>
  ({
    getAdminUrl: () => "http://admin",
  }) as any;

describe("WaitForVerificationViaAcaPyTask", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    process.env.ACAPY_VERIFIED_GRACE_MS = "2000";
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.ACAPY_VERIFIED_GRACE_MS;
    global.fetch = originalFetch;
  });

  test("passes when verified becomes true within grace window after done", async () => {
    const responses = [
      makeResponse({ state: "done", verified: false }),
      makeResponse({ state: "done", verified: true }),
    ];
    global.fetch = jest
      .fn()
      .mockImplementation(() => Promise.resolve(responses.shift() ?? makeResponse({ state: "done", verified: true }))) as any;

    const task = new WaitForVerificationViaAcaPyTask(makeAdapter(), "Wait", "Wait for verification");
    const runPromise = task.run({ presentationExchangeId: "ex-123" });

    await jest.advanceTimersByTimeAsync(2000);
    await runPromise;

    expect(task.state.status).toBe("Accepted");
  });

  test("fails when done is observed but verified never becomes true", async () => {
    const responses = [
      makeResponse({ state: "done", verified: false }),
      makeResponse({ state: "done", verified: false }),
    ];
    global.fetch = jest
      .fn()
      .mockImplementation(() => Promise.resolve(responses.shift() ?? makeResponse({ state: "done", verified: false }))) as any;

    const task = new WaitForVerificationViaAcaPyTask(makeAdapter(), "Wait", "Wait for verification");
    const runPromise = task.run({ presentationExchangeId: "ex-456" });

    await jest.advanceTimersByTimeAsync(2000);

    await expect(runPromise).rejects.toThrow("Verified grace window elapsed without verified=true");
  });

  test("fails when the record disappears before verified becomes true", async () => {
    const responses = [
      makeResponse({ state: "presentation-sent", verified: false }),
      makeResponse("not found", false, 404),
    ];
    global.fetch = jest
      .fn()
      .mockImplementation(() => Promise.resolve(responses.shift() ?? makeResponse("not found", false, 404))) as any;

    const task = new WaitForVerificationViaAcaPyTask(makeAdapter(), "Wait", "Wait for verification");
    const runPromise = task.run({ presentationExchangeId: "ex-789" });

    await jest.advanceTimersByTimeAsync(2000);

    await expect(runPromise).rejects.toThrow("Verifier record disappeared before verified=true");
  });
});
