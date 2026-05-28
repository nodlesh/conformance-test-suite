# Migrate CTS Credo Integration To 0.6.x

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

`PLANS.md` is checked into the repo root at `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/PLANS.md`. This plan must be maintained in accordance with it.

## Purpose / Big Picture

CTS currently integrates Credo through the code under `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/`, and that integration is pinned to the Credo `0.5.x` API family. The purpose of this plan is to migrate that integration to the Credo `0.6.x` API family in a controlled way, while preserving current CTS flow semantics, current evidence contracts, and the current ACA-Py baseline behavior.

The user-visible outcome is that CTS can run its Credo-backed Holder, Verifier, and Issue utility paths on Credo `0.6.x` without compile breaks, runtime bootstrap failures, or hidden behavior changes. A maintainer should be able to prove the migration worked by running the existing CTS stack, triggering the current flows, and observing the same pass/fail behavior and evidence shape as before the migration.

This plan is migration-only. It does not claim to solve the current `did_rotate~attach` interoperability question. It creates the path to test whether that issue still exists on `0.6.x`.

## Scope

In scope:

- Migrating the in-repo Credo integration from `@credo-ts/* 0.5.x` to a pinned `0.6.x` version.
- Updating CTS code that directly imports or calls Credo APIs.
- Restoring clean compile, server build, and container startup on the migrated dependency line.
- Re-running the current CTS flows to determine whether the known `0.5.x` DIDExchange interoperability problem reproduces on `0.6.x`.
- Preserving current CTS evidence outputs, logs, and UI/report contracts.

Out of scope:

- Changing CTS flow semantics, DAG order, pass/fail criteria, or TRQP two-run meaning.
- Changing ACA-Py behavior, `acapy-control`, or baseline ACA-Py permutations.
- Introducing new anoncreds capabilities.
- Bundling a major role-routing or sidecar architecture rewrite into the same change.
- Assuming the migration itself fixes the current Credo-to-ACA-Py DID rotate signature verification problem.

## Progress

- [x] (2026-03-17 22:15Z) Re-read `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/PLANS.md` before creating this separate migration ExecPlan.
- [x] (2026-03-17 22:15Z) Confirmed the current repo already contains a parity ExecPlan at `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/EXECPLAN-credo-parity-acapy-flows.md`, and this new document is intentionally separate.
- [x] (2026-03-17 22:15Z) Recorded the current migration fact pattern: latest npm Credo is `0.6.3`, current CTS integration is pinned to `0.5.19`, and a direct bump to `0.6.3` does not compile with the current code.
- [ ] Produce a compile-clean `0.6.x` migration branch with no CTS flow-contract changes.
- [ ] Rebuild the docker stack and verify startup remains deterministic.
- [ ] Re-run Issue, Holder, and Verifier flows and record whether the known `did_rotate~attach` interoperability failure still reproduces.
- [ ] Decide whether the migration can be promoted as a supported CTS dependency update or must remain a staging branch pending upstream Credo help.

## Surprises & Discoveries

- Observation: The current CTS Credo integration is tightly coupled to `0.5.x` APIs such as `ConnectionsModule`, `CredentialsModule`, `ProofsModule`, `OutOfBandModule`, `agent.oob`, `agent.connections`, `agent.proofs`, and `agent.credentials`.
  Evidence: `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/core/agent/core/BaseAgent.ts` and `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/core/agent/controller/adapters/CredoAgentAdapter.ts` use these APIs directly.

- Observation: A direct dependency bump to Credo `0.6.3` was not a package-only change. It produced widespread compile failures across the current integration.
  Evidence: The failed build touched `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/core/agent/core/BaseAgent.ts`, `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/core/agent/controller/adapters/CredoAgentAdapter.ts`, `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/core/agent/tasks/*`, and `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/cts/server/pipelines/verifierTestPipeline.ts`.

- Observation: The current installed `@credo-ts/core 0.6.3` build clearly contains JWS and packaging changes, but local inspection did not reveal an explicit DIDExchange `did_rotate~attach` verification fix.
  Evidence: Searching `conformance-stack/node_modules/.pnpm/@credo-ts+core@0.6.3_typescript@5.5.4/node_modules/@credo-ts/core/build/` showed JWS internals such as `build/crypto/JwsService.mjs`, but did not surface an obvious `DidExchangeProtocol` rotate-signature fix path.

- Observation: The latest compatible retest on `0.5.x` still reproduces the known connection failure before credential issuance.
  Evidence: `conformance-stack/logs/acapy-holder-control.log` contains `DIDXManagerError: DID rotate attachment signature failed verification`, and `conformance-stack/logs/app.log` shows the CTS connection wait timing out.

## Decision Log

- Decision: Keep the `0.6.x` migration as a separate ExecPlan from the parity ExecPlan.
  Rationale: The migration is a dependency and API transition with its own risk profile. Mixing it into the parity plan would blur whether failures come from protocol parity gaps or from framework migration breakage.
  Date/Author: 2026-03-17 / Codex

- Decision: Treat `0.6.3` as the target version unless upstream guidance indicates a safer `0.6.x` pin.
  Rationale: `0.6.3` is the current latest npm release and is the most useful target if the goal is to determine whether newer Credo already resolves the current DIDExchange problem.
  Date/Author: 2026-03-17 / Codex

- Decision: Preserve CTS flow contracts and evidence contracts exactly during the migration.
  Rationale: If the migration changes the meaning of pass/fail, the output is not a dependency upgrade. It is a CTS semantic change, which is out of scope for this work.
  Date/Author: 2026-03-17 / Codex

- Decision: Do not assume the `0.6.x` migration solves the `did_rotate~attach` interoperability problem.
  Rationale: The current evidence only shows that `0.5.19` still fails and that `0.6.3` has not yet been run successfully in this repo. The migration must preserve the ability to observe the same failure if it still exists.
  Date/Author: 2026-03-17 / Codex

## Outcomes & Retrospective

At plan creation time, no `0.6.x` migration has been completed. The main outcome so far is clarity:

- The current codebase is still a `0.5.x` Credo integration.
- Moving to `0.6.x` is a structured migration, not a bump-and-test exercise.
- The migration needs to preserve current CTS semantics so that any post-migration protocol failure can be interpreted as a real interoperability result, not a CTS regression.

The retrospective target for this plan is:

- CTS compiles and starts cleanly on Credo `0.6.x`.
- Existing Credo-backed flows run without hidden semantic change.
- The repository can answer, with evidence, whether the current DID rotate interoperability problem remains on `0.6.x`.

## Context and Orientation

This repository currently runs its active CTS stack from `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/`.

Key files for the migration:

- `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/core/package.json`
  The main Credo dependency pin for the shared CTS core package.
- `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/cts/package.json`
  The CTS server/UI package, which also pins Credo packages.
- `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/package.json`
  Root workspace overrides. This currently contains a compatibility override for `@noble/hashes` to keep the `0.5.x` runtime healthy.
- `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/core/agent/core/BaseAgent.ts`
  The main in-process Credo bootstrap and module wiring.
- `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/core/agent/controller/adapters/CredoAgentAdapter.ts`
  The adapter that translates CTS role actions into Credo operations.
- `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/core/agent/tasks/receive-connection.ts`
  Direct Credo invitation and connection acceptance logic.
- `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/core/agent/tasks/propose-proof.ts`
  Direct proof proposal and event handling logic.
- `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/core/agent/scripts/initialize.ts`
  Local bootstrap/test harness code that also touches Credo directly.
- `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/cts/src/services/agentService.server.ts`
  CTS server-side service code that uses Credo APIs directly.
- `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/cts/src/services/invitation.ts`
  Invitation helpers built around current Credo events and connection records.
- `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/cts/scripts/test-verifier.ts`
  Local verifier script that uses Credo proof and invitation APIs directly.

Terms used in this plan:

- Credo `0.5.x`: the older API family the current CTS integration was built against.
- Credo `0.6.x`: the newer API family, with changed module wiring and service access.
- CTS evidence contract: the logs, exchange IDs, UI/report output, and API response shape CTS already exposes. This must remain backward compatible during migration.
- Oracle: the current CTS flow behavior and ACA-Py baseline in this repo. The migration does not redefine correctness.

How CTS is run today:

- Containers are started with `docker compose` from `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/`.
- The CTS app and server live in the `app` container.
- Logs are written to `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/logs/`.
- Flows are triggered through the UI or `POST /api/run`.

## Architecture and Data Flow

Current end-to-end Credo path:

1. `packages/core/agent/core/BaseAgent.ts` constructs an in-process Credo agent and registers transports.
2. `packages/core/agent/controller/adapters/CredoAgentAdapter.ts` exposes higher-level CTS actions such as:
   - create invitation
   - wait for connection
   - request proof
   - issue credential
3. CTS pipelines and tasks call the adapter or, in several places, call Credo APIs directly.
4. CTS then computes flow outcomes from explicit records, proof verification values, and bounded waits.

The migration must preserve that data flow shape from CTS’s perspective even if the underlying Credo APIs move. In plain language: CTS should still ask for the same thing and get the same kind of answer, even if the adapter implementation has to change substantially.

If a new helper or wrapper layer is needed to absorb the `0.6.x` API differences, it should be added inside the Credo integration code, not by changing CTS flow meaning.

## Plan of Work

### Milestone 1: Produce a compile map for `0.6.x`

Files:

- `conformance-stack/packages/core/package.json`
- `conformance-stack/packages/cts/package.json`
- `conformance-stack/package.json`

Change:

- Pin the workspace to a single Credo `0.6.x` version.
- Attempt a clean install and capture compile errors as a migration checklist.

How to prove it works:

- The repo has a recorded, reproducible list of all migration breakpoints.
- No CTS behavior is changed in this milestone; this is a migration inventory milestone.

### Milestone 2: Migrate agent bootstrap

Files:

- `conformance-stack/packages/core/agent/core/BaseAgent.ts`

Change:

- Replace `0.5.x` module and transport wiring with the `0.6.x` equivalent.
- Preserve current CTS behavior for:
  - inbound HTTP transport
  - outbound transport registration
  - DID creation support needed by CTS
  - credential and proof format support CTS already relies on

How to prove it works:

- `pnpm --filter @demo/core run compile` succeeds.
- The docker stack starts and `GET /api/health` returns success.

### Milestone 3: Migrate Credo adapter behavior

Files:

- `conformance-stack/packages/core/agent/controller/adapters/CredoAgentAdapter.ts`
- `conformance-stack/packages/core/agent/controller/types.ts`

Change:

- Update invitation, connection, proof, and credential methods to `0.6.x` APIs.
- Preserve CTS adapter contracts so pipelines and tasks do not need semantic changes.

How to prove it works:

- TypeScript compile passes.
- Existing issue-flow and holder-flow code paths can still request invitations, wait for connections, request proofs, and issue credentials.

### Milestone 4: Migrate direct CTS-side Credo API callers

Files:

- `conformance-stack/packages/core/agent/tasks/receive-connection.ts`
- `conformance-stack/packages/core/agent/tasks/propose-proof.ts`
- `conformance-stack/packages/core/agent/scripts/initialize.ts`
- `conformance-stack/packages/cts/src/services/agentService.server.ts`
- `conformance-stack/packages/cts/src/services/invitation.ts`
- `conformance-stack/packages/cts/scripts/test-verifier.ts`
- `conformance-stack/packages/cts/server/pipelines/verifierTestPipeline.ts` if required by the migrated typings

Change:

- Replace direct `0.5.x` Credo API calls with `0.6.x` equivalents.
- Keep bounded waits, explicit verification semantics, and evidence logging intact.

How to prove it works:

- `pnpm --filter cts-3 run build:server` succeeds.
- The app container starts cleanly.

### Milestone 5: Runtime retest on `0.6.x`

Files:

- no new product files required unless migration fixes reveal small compatibility gaps

Change:

- Re-run the current CTS stack on `0.6.x`.
- Execute Issue, Holder, and Verifier flows using current flow contracts.
- Capture whether the known ACA-Py rejection of Credo `did_rotate~attach` still occurs.

How to prove it works:

- Startup logs in `conformance-stack/logs/` are clean.
- `POST /api/run` completes flows or fails with explicit evidence.
- If the DID rotate failure persists, the same failure is visible and attributable.
- If it is fixed, the connection completes and later flow steps proceed without changing CTS semantics.

## Oracle and Conformance Rules

The oracle for this migration is the current CTS behavior on this branch, not an imagined cleaner design.

Canonical expectations:

- Flow semantics are immutable.
- Positive proof success still means `proof_record.verified === true`, not `done` alone.
- CTS evidence contracts remain backward compatible. Additive data is allowed; breaking changes are not.
- ACA-Py baseline permutations remain unchanged.
- If Credo still fails DIDExchange interop on `0.6.x`, CTS must show the failure explicitly in logs and flow outcome; it must not infer success or auto-retry its way past it.

Where these rules live today:

- CTS execution semantics: `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/AGENTS.md`
- Active parity plan: `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/EXECPLAN-credo-parity-acapy-flows.md`
- Pipeline/task behavior: files under `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/cts/server/`

## Test Cases

Positive cases to preserve:

- ACA-Py baseline permutation still starts and runs unchanged.
- Credo-backed CTS startup on `0.6.x` succeeds.
- Existing Credo-supported issue-flow path still reaches the same issuance logic when connection establishment succeeds.

Negative cases to preserve:

- If proof verification is missing or false, CTS still fails explicitly.
- If connection establishment times out, CTS still fails with a bounded, logged error.
- If the DID rotate interoperability problem persists on `0.6.x`, ACA-Py holder rejection must still be visible in logs and surfaced as the reason the connection did not complete.

Interoperability matrix in scope for migration validation:

- `ACA-Py reference + ACA-Py demo` as the baseline regression lock.
- Current Credo-backed path already under active parity work, with focus on the connection and issue flow.

## Concrete Steps

Run from repo root unless stated otherwise.

  $ source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
  $ cd /Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack
  $ pnpm install --ignore-scripts
  Expected:
    Install completes and writes a lockfile state for the selected `0.6.x` pin.

  $ pnpm --filter @demo/core run compile
  Expected:
    TypeScript compile completes without Credo API errors.

  $ pnpm --filter cts-3 run build:server
  Expected:
    Server build completes.

  $ cd /Users/Shel/.codex/worktrees/ba16/conformance-test-suite
  $ docker compose down -v
  $ COMPOSE_PROFILES=with-ngrok docker compose up --build --force-recreate app acapy-control acapy-holder-control acapy-verifier-control ngrok
  Expected:
    `app` stays up, `GET /api/health` returns healthy, and logs are written under `conformance-stack/logs/`.

  $ curl -sf http://localhost:5005/api/health
  Expected:
    JSON with healthy server status.

  $ curl -sf -X POST http://localhost:5005/api/run -H 'Content-Type: application/json' -d '{"pipelineType":"ISSUER_TEST"}'
  Expected:
    The flow starts. If it fails, the failure reason is explicit in `conformance-stack/logs/app.log` and counterpart service logs.

## Validation and Acceptance

This migration is accepted only if all of the following are true:

- The workspace compiles cleanly on the pinned Credo `0.6.x` version.
- The app container starts without hidden backend failure.
- `GET /api/health` reports healthy.
- Current CTS evidence files remain readable and backward compatible.
- The ACA-Py baseline permutation remains behaviorally unchanged.
- CTS can answer, with logs and exchange IDs, whether the Credo-to-ACA-Py `did_rotate~attach` interoperability problem is still present on `0.6.x`.

Evidence locations:

- `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/logs/app.log`
- `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/logs/acapy-holder-control.log`
- `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/logs/acapy-control.log`
- UI/report output in the running CTS app

## Security, Privacy, and Tenant Isolation

This migration does not introduce a new tenant model. It must preserve the current one.

Requirements:

- No new secret material should be logged.
- Existing log files under `conformance-stack/logs/` remain local developer artifacts.
- The migration must not weaken current CTS role isolation or authentication behavior.
- If `0.6.x` changes event payload shape, CTS should summarize only the fields needed for evidence, not dump raw sensitive records unnecessarily.

## Idempotence and Recovery

This plan must be safe to repeat.

Safe retry path:

- Re-run installs after cleaning workspace volumes if container dependencies become stale.
- Re-run compile and server build after each migration slice.
- Re-run docker startup only after compile is clean.

Rollback path:

- Restore the exact `0.5.19` dependency pins in:
  - `conformance-stack/package.json`
  - `conformance-stack/packages/core/package.json`
  - `conformance-stack/packages/cts/package.json`
  - `conformance-stack/pnpm-lock.yaml`
- Remove any `0.6.x`-specific compatibility shims that are not required on `0.5.19`.
- Re-run the current baseline validation commands.

## Artifacts and Notes

Current timeline facts:

  - `@credo-ts/core 0.5.19` publish time: 2025-12-04T14:56:59.833Z
  - `@credo-ts/core 0.6.0` publish time: 2025-12-04T15:10:11.154Z
  - `@credo-ts/core 0.6.3` publish time: 2026-03-09T19:53:28.922Z

Current known `0.5.x` interoperability evidence:

  - `conformance-stack/logs/acapy-holder-control.log` contains:
      DIDXManagerError: DID rotate attachment signature failed verification

  - `conformance-stack/logs/app.log` contains:
      Timeout has occurred
      meta: ConnectionService.returnWhenIsConnected

## Interfaces and Dependencies

Dependencies affected:

- `@credo-ts/core`
- `@credo-ts/node`
- `@credo-ts/anoncreds`
- `@credo-ts/indy-vdr`

Interfaces that must remain stable from the CTS perspective:

- `POST /api/run`
- `GET /api/health`
- current UI flow/report outputs
- current per-service log files under `conformance-stack/logs/`

Pinning policy for this plan:

- Use an exact `0.6.x` pin during migration.
- Do not use a caret range until runtime validation is complete.
