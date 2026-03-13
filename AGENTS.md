# AGENTS.md

## Conformance Test Suite (CTS)

This document defines how **humans** and **AI agents** are expected to work with the CTS codebase.  
It exists to prevent accidental breakage, flaky automation, and protocol misuse.

CTS is **protocol-conformance software**, not a demo app. Correctness, determinism, and traceability matter more than convenience.

---

## Project Goals

CTS exists to:

- Verify conformance to **W3C Verifiable Credentials** and **Aries protocols**
- Exercise **real agent behavior**, not mocks
- Detect protocol violations, not paper over them
- Produce **auditable, repeatable results**

CTS is **not** optimized for:
- Speed at the cost of correctness
- Auto-magic behaviors that hide protocol state
- Silent retries or implicit success paths

---

## Supported Protocols (Hard Constraints)

Agents must respect the following constraints:

- **Present Proof v2.0+ only**
- **No Present Proof v1**
- **No legacy Indy proof flows**
- **No implicit auto-verify assumptions**
- **Verification must be explicit and observable**

If a change weakens these guarantees, it is wrong.

---

## Agent Responsibilities

### Human Maintainers

Humans are responsible for:

- Defining **protocol expectations**
- Approving **semantic changes**
- Deciding what is a **hard failure vs soft assert**
- Reviewing AI-generated changes for protocol correctness

Humans are the final authority.

---

### AI Agents (Codex, Copilot, etc.)

AI agents may:

- Refactor code with **no semantic change**
- Add logging and observability
- Fix determinism issues once the expected behavior is specified
- Implement explicitly described protocol steps

AI agents must **not**:

- Invent protocol behavior
- Assume undocumented agent defaults are supported
- Replace protocol states with heuristics
- Convert hard failures into retries
- Treat `state=done` as success unless explicitly instructed

If behavior is ambiguous, the agent must stop and ask.

---

## ACA-Py and Credo-ts Interaction Rules

CTS treats **ACA-Py** and **Credo-ts** as **black-box protocol engines**.

Rules:

- Do **not** rely on undocumented defaults in ACA-Py or Credo-ts
- Do **not** assume `auto_verify` or `auto_remove` exists or works
- Do **not** assume verification happens automatically
- Verification must be explicitly triggered via the agent’s admin or controller API
- Final success is **verified === true**, nothing else, unless otherwise defined in a negative test

Terminal states:

| State | Meaning |
|-----|--------|
| presentation-received | Verification may now be triggered |
| done | Exchange lifecycle complete, not proof validity |
| abandoned | Hard failure |

Only `verified === true` means success in a positive test.

---

## Stop Conditions

Agents MUST stop and request clarification if:

- Protocol behavior is undocumented or contradictory
- Verification semantics are unclear
- A test outcome cannot be explained with evidence
- A choice would weaken a hard CTS guarantee

Continuing past a stop condition is a defect.

---

## Verification Semantics

CTS defines success as:

```
proof_record.verified === true
```

Not:

- `state === done`
- `no error`
- `exchange completed`

If `verified` is missing, false, or unknown:
- The test **fails**
- The failure must be visible
- The reason must be logged

---

## No Silent Defaults

CTS must not rely on:
- Undocumented defaults
- Implicit retries
- Auto-enabled behaviors

All protocol behavior must be explicit, triggered, and observable.

---

## Change Readability

Prefer:
- Explicit logic over compact logic
- Named states over magic values
- Clear failure paths over clever branching

CTS optimizes for auditability, not elegance.

---

## Webhooks and Events

CTS prefers **event-driven state** over polling when available.

Rules:

- Webhook payloads must be logged (summarized, not raw spam)
- State transitions must be observable
- Verification must be traceable to a specific exchange ID
- Event loss is a hard failure, not a retry trigger

Polling is allowed only as a fallback.

---

## Evidence as a First-Class Output

Any CTS change that affects test execution, verification, or results MUST produce inspectable evidence.

Evidence includes:
- Logs
- Event traces
- Stored test artifacts
- Clear failure reasons

A change that “works” but cannot explain *why* it worked or failed is incomplete.

---

## Logging Requirements

Agents must ensure logging supports post-mortem debugging.

Minimum logging for verifier flows:

- Proof exchange ID
- Webhook state transitions
- Verification request payload
- Verification response
- Verification errors
- Final verified value

Logs must answer:

> “Why did this proof not verify?”

If logs cannot answer that, they are insufficient.

---

## Evidence in Reports and UI

CTS must surface evidence at a human-readable level in reports and UI at the end of each flow.

Requirements:

- Each completed flow MUST produce a concise outcome summary.
- On failure, the summary MUST include:
  - A clear root cause explanation in plain language
  - The specific step or protocol expectation that failed
- The UI MUST direct the user to where deeper evidence can be found
  (for example: logs, traces, exchange IDs, or stored artifacts).

This summary does not need to be verbose.
It must be actionable.

A user should be able to answer:
- What failed?
- Why did it fail?
- Where do I go next to debug?

If a flow fails and the UI cannot answer those questions, the evidence is insufficient.

---

## UI Contract

UI behavior must reflect **task outcome**, not intermediate state.

Rules:

- Stepper success = verified === true
- Stepper failure = verification failed or timed out
- ❌ on failure, never silent advance
- UI must not infer success from protocol completion alone

The UI is a consumer of results, not a decision maker.

---

## Determinism Policy

CTS prefers:

- Explicit state machines
- Bounded waits with clear failure messages
- No infinite retries
- No silent fallbacks

Flakiness is treated as a **bug**, not “environmental noise”.

---

## Code Review Expectations

All changes must answer:

1. What protocol behavior does this rely on?
2. Is that behavior documented?
3. What breaks if ACA-Py or Credo-ts changes?
4. How do we know verification actually occurred?

If these cannot be answered, the change is incomplete.

---

## Final Authority

If there is a conflict between:

- What ACA-Py or Credo-ts appears to do
- What CTS needs to assert

CTS requirements win.

CTS defines correctness.  
Agents implement it.

## ExecPlans

When writing complex CTS features, new profiles, or significant refactors, use an ExecPlan (as described in PLANS.md) from design to implementation.

For any non-trivial CTS work (new profiles, protocol support, test flows, or refactors):

- You MUST create or update an ExecPlan before writing code.
- ExecPlans MUST conform to `PLANS.md`.
- The ExecPlan is a living document and must be updated as implementation proceeds.
- Do not begin implementation until an ExecPlan exists.
- If you cannot produce an ExecPlan that follows PLANS.md, stop and say why.