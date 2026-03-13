# CTS Execution Plans (ExecPlans)

This document defines how we write and execute an execution plan (“ExecPlan”) for the Conformance Test Suite (CTS). An ExecPlan is a living design document that a coding agent (or human) can follow to deliver a working CTS feature, profile, or system change.

Treat the reader as a complete beginner to this repository. They have only the current working tree and the single ExecPlan file you provide. There is no memory of prior plans and no external context.

This PLANS.md is based on the Codex ExecPlans pattern from OpenAI’s cookbook, adapted for CTS-specific work.  [oai_citation:0‡developers.openai.com](https://developers.openai.com/cookbook/articles/codex_exec_plans?utm_source=chatgpt.com)


## How to use ExecPlans and PLANS.md

When authoring an ExecPlan, follow PLANS.md to the letter. If this file is not in your current context, refresh your memory by reading the entire PLANS.md.

When implementing an ExecPlan:
- Do not prompt the user for “next steps”. Proceed milestone by milestone until the plan is complete.
- Keep all sections up to date at every stopping point (Progress, Surprises & Discoveries, Decision Log, Outcomes & Retrospective).
- Resolve ambiguities autonomously. If you must choose, choose and record why.
- Commit frequently, and keep changes incremental and testable.

When discussing an ExecPlan:
- Record decisions in the Decision Log so a future contributor can restart from only the ExecPlan and the repo.
- ExecPlans are living documents. Update the plan as new information appears.


## Non-negotiable requirements

1) Self-contained, always  
Every ExecPlan must be fully self-contained. It must include all knowledge and instructions a novice needs, in its current form. Do not rely on “see external docs” for key facts. If a fact is required, re-explain it in your own words inside the plan.

2) Demonstrably working behavior  
Every ExecPlan must produce behavior a human can verify. Code changes that merely “add structures” or “match types” are insufficient unless the plan also shows how to observe the effect (tests, HTTP call, CLI output, UI behavior, log evidence).

3) Plain language first  
Define every term of art the first time you use it, or do not use it. Prefer ordinary English. If you must use jargon, define it immediately and tie it to where it appears in this repo (files, modules, endpoints, commands).

4) Safety and reversibility  
Write steps that are idempotent (safe to re-run). If a step could break a test environment, corrupt stored results, or expose secrets, include a safe retry and rollback path.

5) Evidence is part of the deliverable  
CTS is about conformance, so your plan must capture evidence: what was tested, what passed/failed, and why. Include concise transcripts, example logs, and test outputs in the plan.


## CTS-specific principles

CTS is not just “run some tests”. The plan must explicitly address these CTS realities:

- Roles and actors: CTS usually evaluates one role (Issuer, Holder, Verifier) by providing known-good counterpart services.
- Profiles: CTS checks conformance to a specific interoperability profile (for example, an OIDC4VC profile, DIDComm profile, data model constraints, or a governance-driven profile). If “profile” is used, define it and enumerate exactly what is in scope.
- Oracle: CTS needs a canonical reference (“oracle”) for what correct behavior looks like: message sequences, required fields, validation rules, and failure conditions. The plan must state where the oracle lives (files and format) and how results are compared against it.
- Trust and registries: If the flow depends on trust registry queries, governance allow-lists, or similar policy checks, the plan must include how CTS proves those checks happened (or how CTS simulates them).
- Multi-tenant and security: CTS often runs for multiple implementers. Plans that introduce endpoints, storage, or logs must address authentication, tenant isolation, and secret handling.
- Reproducibility: A third party must be able to run the plan and get the same outcome with the same inputs. Pin versions, capture configs, and document environment assumptions.


## Formatting rules

Each ExecPlan must be a single fenced code block labeled `md` that begins and ends with triple backticks, and contains the entire plan. Do not nest additional triple-backtick fences inside the ExecPlan. When you need to show commands, diffs, or transcripts, use indented blocks inside the single fence.

When the plan is written to a Markdown file where the file content is only the ExecPlan, omit the triple backticks.

Use two newlines after every heading. Use normal Markdown headings (#, ##, ###). Avoid giant checklists everywhere. Checklists are permitted only in the Progress section, where they are mandatory.


## Common CTS failure modes to avoid

- “Happy path only” plans that never specify negative tests or failure reasons.
- Vague acceptance like “tests pass” without naming which command, which tests, and what “pass” looks like.
- Plans that change protocol logic but do not define how captured messages are compared to the oracle.
- Plans that introduce logs/results storage but do not address PII, secrets, retention, or tenant isolation.
- Plans that add new profile support but never pin down exact scope (transport variants, credential formats, proof types, etc.).


## Milestones

Milestones are narrative and verifiable. Each milestone must:
- Describe what will exist at the end that did not exist before.
- Include commands to run.
- Include acceptance criteria phrased as observable behavior (inputs and outputs).

Each milestone should be independently verifiable and should incrementally build toward the final goal.

Prototyping milestones are allowed and encouraged when they reduce risk. Label them as prototyping, define the promotion criteria (keep vs discard), and keep prototypes additive and testable.


## Living plans and decision recording

Every ExecPlan must include and maintain these sections:
- Progress (checkbox list, with timestamps)
- Surprises & Discoveries (with evidence)
- Decision Log (decision, rationale, date/author)
- Outcomes & Retrospective (at milestones and at completion)

If you change course mid-implementation, document why in Decision Log and reflect implications in Progress.


## Skeleton of a good CTS ExecPlan

Use this skeleton, in this order. Do not remove required sections.

    # <Short, action-oriented description>

    This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

    If PLANS.md is checked into the repo, reference the path to it here and note that this plan must be maintained in accordance with it.

    ## Purpose / Big Picture

    Explain what CTS users gain after this change, and how they can see it working. State the user-visible behavior you will enable. Include who it is for (Issuer, Holder, Verifier implementers) and what conformance claim it supports (which profile, which version).

    ## Scope

    Define exactly what is included and excluded. Be explicit about:
    - Which role is under test (Issuer, Holder, Verifier).
    - Which counterpart components CTS provides (reference issuer, reference holder wallet, reference verifier, mock services).
    - Which protocol/profile/version is targeted.
    - Which transports/variants are supported (if relevant).
    - Any assumptions about trust registries, governance policies, or type catalogs.

    ## Progress

    Use a list with checkboxes to summarize granular steps. Every stopping point must be documented here.

    - [x] (YYYY-MM-DD HH:MMZ) Example completed step.
    - [ ] Example incomplete step.
    - [ ] Example partially completed step (completed: X; remaining: Y).

    ## Surprises & Discoveries

    Document unexpected behaviors, bugs, or constraints discovered during implementation.

    - Observation: …
      Evidence: (paste a short log snippet, test output, or reproduction steps)

    ## Decision Log

    Record every decision made while working on the plan.

    - Decision: …
      Rationale: …
      Date/Author: …

    ## Outcomes & Retrospective

    Summarize what was achieved, what remains, and lessons learned. Compare against the original Purpose.

    ## Context and Orientation

    Describe the current state of the repo relevant to this change as if the reader knows nothing. Name key files and modules by full path. Define non-obvious terms, including CTS-specific ones, in plain language.

    Include at minimum:
    - Where profiles live (definitions, constraints, versioning).
    - Where the oracle lives (canonical sequences, schemas, rules).
    - How tests are executed (CLI, API, UI, runner).
    - Where results and evidence are stored.

    ## Architecture and Data Flow

    Describe, in plain language, the end-to-end flow:
    - How the implementer under test connects to CTS.
    - How CTS provides counterpart services.
    - How messages/events are captured.
    - How the oracle comparison happens.
    - How the final verdict is computed and reported.

    If you add a new dependency or service, explain why and how it is operated locally (for example, via Docker).

    ## Plan of Work

    Describe the sequence of edits and additions in prose. For each change:
    - Name the file path.
    - Name the function/module/endpoint.
    - State what will be added/changed.
    - State how to prove it works.

    Prefer small, incremental edits that keep the system runnable.

    ## Oracle and Conformance Rules

    Define the canonical expectations:
    - Expected message/interaction sequence (in plain language).
    - Required fields and validation rules.
    - What constitutes pass vs fail.
    - What evidence is captured on both success and failure.

    Specify where these rules are encoded (file paths, formats) and how versioning works.

    ## Test Cases

    Describe the tests you will add or update:
    - Positive test(s) that should pass with a conformant implementation.
    - Negative test(s) that should fail for a specific, named reason.
    - If applicable, interoperability matrix (which combinations are in scope).

    Each test case must have a clear assertion and a clear failure message.

    ## Concrete Steps

    State the exact commands to run and where to run them (working directory). Include concise expected output examples.

      $ (repo root) <command>
      Expected:
        <short snippet that indicates success>

    If setup is required (containers, env vars), list the steps and provide safe defaults.

    ## Validation and Acceptance

    Phrase acceptance as observable behavior. Include:
    - How to run the relevant tests and what “pass” looks like.
    - How to run a minimal end-to-end scenario and observe results.
    - Where to find the evidence artifacts (logs, traces, reports) and what they should contain.

    ## Security, Privacy, and Tenant Isolation

    If the change touches APIs, storage, logs, or UI:
    - State the authentication model.
    - State how tenant isolation is enforced.
    - State how secrets are handled.
    - State log redaction rules and retention expectations.

    ## Idempotence and Recovery

    Explain how steps can be repeated safely. If a step can fail halfway, include retry instructions. If a migration is involved, include rollback.

    ## Artifacts and Notes

    Include the most important transcripts, diffs, snippets, and example outputs as indented blocks. Keep them concise.

    ## Interfaces and Dependencies

    List any external interfaces introduced or changed (HTTP endpoints, CLI flags, config files). Pin versions for new dependencies and explain how to update them safely.

## Acceptance Criteria

Acceptance criteria define when this ExecPlan is considered complete.  
All criteria MUST be satisfied unless explicitly marked as out of scope.

Acceptance is based on **observable behavior and evidence**, not intent or implementation detail.

---

### AC1 – Successful Conformance Path

**Given** a conformant implementation for the role under test  
**When** CTS executes the defined flow for this plan  
**Then** all of the following MUST be true:

- The protocol interaction completes without error.
- The final verification condition evaluates to success  
  (for example: `verified === true`, or the equivalent defined by this profile).
- The CTS UI/report shows a clear success outcome.
- The report includes:
  - The relevant exchange or interaction ID(s)
  - The profile and version under test
  - A link or reference to supporting evidence (logs, traces, artifacts)

**Evidence location:**  
- UI summary at end of flow  
- Stored logs and traces referenced by ID

---

### AC2 – Expected Failure (Negative Test)

**Given** an implementation that violates a defined protocol or profile rule  
**When** CTS executes the same flow  
**Then** all of the following MUST be true:

- CTS fails the run deterministically.
- The failure reason is explicit and stable (no generic “unknown error”).
- The CTS UI/report shows:
  - A concise root-cause explanation in plain language
  - The protocol step or rule that was violated
- The report directs the user to where deeper evidence can be found
  (logs, traces, exchange IDs, or stored artifacts).

**Failure classification:**  
- Named failure reason or code (for example: `VERIFICATION_NOT_TRIGGERED`, `TRQP_AUTHZ_FAILED`)

**Evidence location:**  
- UI failure summary  
- Referenced logs/traces by ID

---

### AC3 – Determinism and Repeatability

**Given** the same inputs and environment  
**When** this CTS flow is executed repeatedly  
**Then**:

- Outcomes are stable and repeatable.
- No flakiness is observed.
- Timeouts, if they occur, fail with the same reason and evidence.
- The last observed protocol state is captured in the report.

Flakiness is treated as a defect.

---

### AC4 – Evidence Quality

For both success and failure cases:

- Evidence MUST exist at multiple levels:
  - Human-readable summary in the UI/report
  - Machine-level detail in logs or traces
- The UI/report MUST answer:
  - What happened?
  - Why did it happen?
  - Where can I go next to debug?

If these questions cannot be answered, the criteria are not met.

---

### AC5 – Scope Integrity

- No behavior outside the defined scope is introduced.
- No protocol assumptions are made beyond what is explicitly defined in this plan.
- Changes do not weaken existing CTS guarantees.

---

### Acceptance Sign-off

This ExecPlan is complete when:
- All acceptance criteria above are satisfied
- Evidence is reviewable by a third party
- Results are reproducible using the documented steps