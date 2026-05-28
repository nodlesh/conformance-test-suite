# Reimplement Credo Parity On PR29 Base

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

`PLANS.md` is checked into the repo root at `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/PLANS.md`. This plan must be maintained in accordance with it.

## Purpose / Big Picture

CTS currently runs from `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/`. The goal is to bring Credo to parity with the current `main + PR29` behavior for the Holder flow, Verifier flow, and Issue utility flow without dragging forward the older branch’s broad runtime rewrites.

The user-visible outcome is that CTS can choose Credo or ACA-Py for the reference roles and demo roles using the current branch’s flow contracts, while preserving the new TRQP mode/profile behavior already present on this base.

## Scope

In scope:

- Credo-specific controller adapters, services, and routing needed to match ACA-Py behavior in the current `conformance-stack/` runtime.
- Role selection and agent wiring needed for Credo as:
  - reference verifier in Holder flow
  - reference holder in Verifier flow
  - reference or demo holder in Issue utility flow where current contracts allow it
- W3C LDP + DIDComm v2 parity only.
- Validation, logging, and UI evidence needed to make pass/fail decisions explicit.

Out of scope unless human-approved later:

- Changes to flow semantics, DAG ordering, pass/fail rules, or TRQP two-run meaning.
- Changes to ACA-Py agent behavior or `acapy-control` unless the current base already requires them.
- New anoncreds support for Credo.
- Porting the old branch’s entire extracted-controller architecture wholesale.

## Progress

- [x] (2026-03-17 00:00Z) Confirmed the fresh restart branch is `codex/credo-parity-pr29-base`, based on GitHub PR #29 merge ref `0caae7f`.
- [x] (2026-03-17 00:00Z) Re-read `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/AGENTS.md` and `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/PLANS.md`.
- [x] (2026-03-17 00:00Z) Confirmed the active runtime tree on this branch is `conformance-stack/`, not `certification-simple/`.
- [x] (2026-03-17 00:30Z) Compared the current `conformance-stack/` runtime against `feat/credo-parity-acapy-flows` and isolated the first minimal Credo-specific changes worth porting.
- [x] (2026-03-17 00:55Z) Implemented the first minimal parity slice and validated that `@demo/core` compile and `cts-3` server build still pass on this base.
- [x] (2026-03-17 11:55Z) Added host-mounted per-service log capture for the current docker-compose stack so runtime evidence lands directly in `conformance-stack/logs/` instead of requiring manual copy/paste.
- [x] (2026-03-17 16:40Z) Isolated the current Issue flow runtime blocker to Credo DIDExchange interoperability with the ACA-Py holder, not to W3C issuance payload handling.
- [x] (2026-03-17 17:35Z) Pinned the workspace Credo line from `0.5.11` to exact `0.5.16`, updated `conformance-stack/pnpm-lock.yaml`, and restored green compile/build checks for `@demo/core` and `cts-3`.
- [x] (2026-03-17 17:00Z) Patched the docker stack so `conformance-stack/node_modules` is container-owned, not host-mounted, and added native build tooling to the dev image to unblock Linux native dependency startup.
- [ ] Run targeted end-to-end validation for the supported role permutations and record evidence here.

## Surprises & Discoveries

- Observation: This branch still uses `conformance-stack/` as the tracked runtime tree. `certification-simple/` exists in the worktree only as leftover local files and generated artifacts from prior work.
  Evidence: `git ls-tree --name-only HEAD` lists `conformance-stack` and does not list tracked files under `certification-simple`.

- Observation: PR #29 merge ref already includes PR #27 TRQP mode/profile work on top of current `main`, but still uses the older in-process Credo/ACA-Py runtime model in `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/cts/server/server.ts`.
  Evidence: `git log --oneline --decorate -n 3` on this branch shows `0caae7f` atop `2dcc1e1`, and current `server.ts` still imports `BaseAgent`, `CredoAgentAdapter`, and `AcaPyAgentAdapter`.

- Observation: The current base already has a Credo-specific proof request shape in `holderTestPipeline.ts`, so the first blocker on this branch is W3C issuance parity, not proof-request payload parity.
  Evidence: `holderTestPipeline.ts` already switches between ACA-Py DIF payloads and Credo `presentationExchange` payloads based on adapter type.

- Observation: Local install and compile on this branch require an explicit Node 20 shell and `pnpm install --ignore-scripts` because the host machine currently blocks native postinstall builds with an unaccepted Xcode license.
  Evidence: `pnpm install --frozen-lockfile` failed in `@2060.io/ref-napi` postinstall; `pnpm install --frozen-lockfile --ignore-scripts` completed, after which `pnpm --filter @demo/core run compile` and `pnpm --filter cts-3 run build:server` succeeded.

- Observation: Container log collection was a usability bottleneck during runtime debugging because docker stdout/stderr was not automatically persisted into the repo’s evidence folder.
  Evidence: Manual copy/paste into `conformance-stack/logs/*.log` was required to review startup failures and flow traces after each run.

- Observation: The current Issue flow failure on this branch happens during DIDExchange connection establishment between Credo inviter and ACA-Py holder, before credential issuance starts.
  Evidence: `conformance-stack/logs/app.log` ends with `Timeout has occurred` for `ConnectionService.returnWhenIsConnected`, while `conformance-stack/logs/acapy-holder-control.log` shows `DIDXManagerError: DID rotate attachment signature failed verification` after Credo returns the DIDExchange response.

- Observation: The workspace is still pinned to `@credo-ts/* ^0.5.11`, but Credo merged a related DIDComm signed-attachment interoperability fix in PR `#2694` on 2026-03-12.
  Evidence: `conformance-stack/packages/core/package.json` and `conformance-stack/packages/cts/package.json` both specify `^0.5.11`; upstream Credo issue `#2687` and PR `#2694` document a prior ACA-Py interop failure around DIDComm signed attachment headers.

- Observation: A naive caret bump to `^0.5.16` resolved to Credo `0.5.19`, which introduced additional `@cheqd/ts-proto` build requirements and broke `@demo/core` compile under the package’s `ES6` TypeScript target.
  Evidence: `pnpm install` resolved `@credo-ts/*` to `0.5.19`, and `pnpm --filter @demo/core run compile` then failed with repeated `BigInt literals are not available when targeting lower than ES2020` errors from `@cheqd/ts-proto`.

- Observation: Pinning Credo to exact `0.5.16` and raising only `packages/core/tsconfig.build.json` to `ES2020` restores clean local compile/build checks while keeping the dependency change narrow.
  Evidence: `pnpm --filter @demo/core run compile` and `pnpm --filter cts-3 run build:server` both succeeded after setting `target` and `lib` to `ES2020` in `packages/core/tsconfig.build.json`.

- Observation: The app container was still loading native modules from the host `conformance-stack/node_modules` tree because the bind mount masked only the repo-root `node_modules`, not the workspace-local one.
  Evidence: `conformance-stack/logs/app.log` showed `No native build was found ... loaded from: /workspaces/conformance-test-suite/conformance-stack/node_modules/.pnpm/@2060.io+ref-napi@3.0.6/...`, and `docker-compose.yml` only defined a named volume for `/workspaces/conformance-test-suite/node_modules` before this patch.

## Decision Log

- Decision: Restart the parity implementation from PR #29 merge base instead of continuing on `feat/credo-parity-acapy-flows`.
  Rationale: The old branch diverged too far from upstream and would keep creating ambiguous merges. Starting from the new base keeps the current TRQP and UI behavior intact.
  Date/Author: 2026-03-17 / Codex

- Decision: Treat `feat/credo-parity-acapy-flows` as reference-only, not as a branch to merge wholesale.
  Rationale: The old branch contains useful Credo-specific code, but it also carries repo-shape and runtime-architecture changes that do not belong on this base.
  Date/Author: 2026-03-17 / Codex

- Decision: The active implementation target for this restart is `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/`.
  Rationale: That is the tracked runtime tree on this branch and where the current flows, server wiring, UI, and docker stack live.
  Date/Author: 2026-03-17 / Codex

- Decision: Start with the smallest W3C issuance parity slice instead of reintroducing the old branch’s extracted Credo control services.
  Rationale: The current base already has in-process Credo plumbing and Credo-specific holder proof payloads. The first missing behavior is that W3C issuance still assumes ACA-Py for issuer DID creation and exchange completion. Fixing that first proves the current architecture can host parity work with smaller diffs.
  Date/Author: 2026-03-17 / Codex

- Decision: Preserve the old branch’s role-based env cleanup and explicit sidecar direction as the target architecture for this restart, but do not force that restructure into the first parity slice.
  Rationale: The old branch had the better operator model: explicit role selection, explicit role control URLs, and Credo sidecars that mirror ACA-Py role containers. This makes role ownership, logs, startup commands, and permutation support auditable. However, reintroducing that full runtime restructure immediately would mix architecture churn with the first parity fixes and make validation harder.
  Date/Author: 2026-03-17 / Codex

- Decision: Before patching Credo DIDExchange behavior locally, first bump the workspace from `@credo-ts/* 0.5.11` to `0.5.16` and retest the failing Issue flow.
  Rationale: The observed failure is in DID rotate attachment verification during DIDExchange, and Credo merged a closely related ACA-Py interoperability fix after `0.5.11`. Testing the current published release first avoids carrying local workaround code for a dependency bug that may already be fixed upstream.
  Date/Author: 2026-03-17 / Codex

- Decision: Pin Credo to exact `0.5.16` instead of using a caret range.
  Rationale: `^0.5.16` resolved to `0.5.19`, which pulled in broader transitive dependency changes and an avoidable TypeScript build blocker. Exact pinning gives a controlled interop test against the first Credo release line known to postdate the upstream DIDComm attachment fix.
  Date/Author: 2026-03-17 / Codex

- Decision: Raise only `packages/core/tsconfig.build.json` to `ES2020` for the Credo bump.
  Rationale: The newer Credo/cheqd dependency graph emits BigInt literals during `@demo/core` compile. Narrowing the TS target change to the core package keeps the compatibility fix local to the package that actually compiles those dependencies and avoids a broader repo-wide TypeScript target change.
  Date/Author: 2026-03-17 / Codex

- Decision: Make `conformance-stack/node_modules` a dedicated Docker volume and install native build tooling in `./.devcontainer/Dockerfile`.
  Rationale: The startup failure is environmental, not protocol-level. As long as the container sees host-built native packages under the workspace-local `node_modules`, CTS cannot boot reliably. Masking that path and ensuring the image can compile native modules is the smallest deterministic fix.
  Date/Author: 2026-03-17 / Codex

## Outcomes & Retrospective

Work has restarted on a clean base and the first parity slice is now landed locally on this branch:

- `packages/core/agent/core/BaseAgent.ts` now enables Credo JSON-LD credential format support for V2 credentials and explicitly auto-accepts credentials.
- `packages/core/agent/controller/adapters/CredoAgentAdapter.ts` now supports:
  - `did:key` creation through a generic `createDid(...)` path
  - JSON-LD W3C issuance through `issueLdProofCredential(...)`
  - event-first, query-fallback exchange completion waiting for credential issuance
- `packages/cts/server/tasks/issueAyraW3CTask.ts` no longer hard-codes ACA-Py for holder `did:key` creation and can consume either issuer adapter as long as it exposes the required W3C methods.
- `packages/cts/server/state.ts` now allows the existing W3C issue pipeline to be selected with a non-ACA-Py issuer controller.

The next outcome checkpoint must cover runtime evidence, not just compile success.

Additional runtime-debugging improvement now landed locally:

- `docker-compose.yml` mounts `./conformance-stack/logs` and `./scripts` into the active services and routes service output through a small log wrapper.
- `scripts/log-runner.sh` tees service stdout/stderr to host log files while preserving the wrapped command’s exit code.

Current runtime blocker:

- Credo inviter to ACA-Py holder Issue flow still fails before issuance because ACA-Py rejects Credo’s DIDExchange response with `DID rotate attachment signature failed verification`, after which CTS times out waiting for the connection to become connected.
- The next checkpoint will determine whether that blocker is resolved by moving from Credo `0.5.11` to exact `0.5.16` or whether a local Credo integration change is still required.

## Planned Env / Sidecar Consistency Model

This section records the env and service model direction already explored on `feat/credo-parity-acapy-flows` and should guide later parity slices on this branch.

Target properties:

- All concrete agent roles should be explicit services, regardless of implementation.
- `app` should be CTS orchestration/UI only, not a hidden Credo role runtime.
- Role selection should be expressed with role-based env vars instead of ACA-Py-specific URL names.
- The selected runtime permutation should be obvious from both the `.env` and the compose service list.

Target service shape:

- `acapy-issuer-control`
- `acapy-holder-control`
- `acapy-verifier-control`
- `credo-issuer-control`
- `credo-holder-control`
- `credo-verifier-control`
- `app`
- `ngrok`

Target env shape:

- `REFERENCE_AGENT`
- `REFERENCE_ISSUER_OVERRIDE_AGENT`
- `REFERENCE_VERIFIER_OVERRIDE_AGENT`
- holder-role override variable when the verifier flow holder role is externally selected
- role-based control URLs:
  - `ISSUER_CONTROL_URL`
  - `HOLDER_CONTROL_URL`
  - `VERIFIER_CONTROL_URL`
- explicit booleans for whether CTS should auto-use internal reference-controlled roles during issue/holder/verifier flows when a demo role is required

Constraints:

- This env/sidecar cleanup must preserve existing flow contracts.
- It must not hide role selection behind undocumented startup magic.
- It should be introduced as a later parity slice after enough runtime evidence exists for the current smaller changes.

## Context and Orientation

CTS on this branch runs from `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/`.

Key files:

- `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/cts/server/server.ts`
  The runtime bootstrap. Today it starts in-process Credo when requested, starts ACA-Py control adapters, and applies TRQP mode/profile parameters for pipeline runs.
- `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/cts/server/state.ts`
  The pipeline selection and agent/controller registry.
- `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/cts/server/pipelines/holderTestPipeline.ts`
  Holder conformance flow.
- `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/cts/server/pipelines/verifierAcaPyPipeline.ts`
  ACA-Py-centered verifier flow and TRQP enforcement.
- `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/cts/server/pipelines/verifierTestPipeline.ts`
  Credo-centered verifier flow path.
- `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/cts/server/tasks/issueAyraW3CTask.ts`
  W3C issuance utility task.

Reference-only source branch:

- `feat/credo-parity-acapy-flows`
  Useful for Credo control service, control adapter, and issue/proof parity fixes. It is not the oracle.

Oracle:

- The oracle is the behavior of current `main + PR29` flows and ACA-Py integrations in this repo, especially in the files listed above.

Tests and execution:

- CTS UI/API runs from `conformance-stack/packages/cts`.
- Supporting services run from `conformance-stack/docker-compose.yml`.
- Validation commands will be run from `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/`.

## Architecture and Data Flow

Today’s base works like this:

1. The CTS server in `server.ts` boots an in-process Credo agent when `REFERENCE_AGENT=credo`, or ACA-Py control adapters when `REFERENCE_AGENT=acapy`.
2. `state.ts` chooses the pipeline based on flow type and selected role override variables.
3. Holder, Verifier, and Issue flows call tasks and pipeline helpers that in turn call either ACA-Py admin/control APIs or the in-process Credo agent adapter.
4. PR #27 and PR #29 already added TRQP mode/profile handling, richer UI reporting, and supporting server helpers.

The restart will keep this architecture unless a smaller extension point clearly supports an extracted Credo controller without fighting the base.

## Plan of Work

The implementation will proceed in small slices:

First, compare the current runtime files in `conformance-stack/` to the old parity branch and identify the minimal useful additions:

- `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/core/agent/controller/adapters/CredoControlAgentAdapter.ts`
  Candidate port if the current base needs an out-of-process Credo control adapter.
- `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/credo-control/src/server.ts`
  Candidate port if the current base still lacks a stable control surface for Credo role containers.
- `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/cts/server/tasks/issueAyraW3CTask.ts`
  Port only the Credo holder DID creation and W3C issuance compatibility changes that are still needed.
- `/Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack/packages/cts/server/pipelines/holderTestPipeline.ts`
  Port only the proof-request shape or Credo parity fixes still missing on this base.

Second, implement only the smallest slice needed to prove the new base can host the Credo parity work without rewriting the whole runtime.
Status: completed for the first W3C issuance slice listed in `Outcomes & Retrospective`.

Third, validate each slice with targeted commands before moving on.
Status: compile-level validation is complete for the first slice; runtime permutation validation is still pending.

Immediate next slice:

- Re-run the current dockerized Issue flow against the updated Credo `0.5.16` line.
- Re-run the Issue flow with Credo as inviter/reference and ACA-Py holder.
- Capture whether the ACA-Py holder still rejects the DIDExchange response, and if so, preserve the new logs as evidence for either a local patch or an upstream Credo issue.

## Oracle and Conformance Rules

The oracle remains unchanged:

- Positive verifier outcomes require explicit proof verification, not just `done`.
- Holder and Verifier flows must preserve the existing DAG and pass/fail meaning.
- TRQP two-run enforcement semantics stay exactly as they are on this base.
- Credo must not fake terminal states or infer success from timing or absence of errors.

Evidence required on success and failure:

- Exchange IDs
- final proof verification value
- explicit failure cause when verification does not succeed
- UI-visible summary aligned with backend evidence

## Test Cases

Initial test matrix for the restart:

- Positive: ACA-Py baseline still passes on this branch after Credo parity slices land.
- Positive: Credo issuer + Credo or ACA-Py holder can complete the W3C Issue utility flow under the current contracts.
- Positive: Credo reference verifier can complete Holder flow under the current contracts.
- Positive: Credo holder path can participate in Verifier flow where current base supports it.
- Negative: Unsupported Credo anoncreds selection fails early and clearly.
- Negative: Proof verification missing or false results in deterministic failure with evidence.

## Concrete Steps

Commands that will be used during implementation:

  $ /Users/Shel/.codex/worktrees/ba16/conformance-test-suite
  $ git diff HEAD..feat/credo-parity-acapy-flows -- <file>
  Expected:
    A narrow list of Credo-specific changes worth porting.

  $ /Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack
  $ source ~/.nvm/nvm.sh && nvm use 20 >/dev/null && pnpm install --frozen-lockfile --ignore-scripts
  Expected:
    Workspace dependencies install without depending on blocked native postinstall steps on the host machine.

  $ /Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack
  $ source ~/.nvm/nvm.sh && nvm use 20 >/dev/null && pnpm --filter @demo/core run compile
  Expected:
    Core adapter and agent changes typecheck cleanly.

  $ /Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack
  $ source ~/.nvm/nvm.sh && nvm use 20 >/dev/null && pnpm --filter cts-3 run build:server
  Expected:
    CTS server build completes with no errors.

  $ /Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack
  $ source ~/.nvm/nvm.sh && nvm use 20 >/dev/null && pnpm install --ignore-scripts --force --no-frozen-lockfile
  Expected:
    `conformance-stack/pnpm-lock.yaml` and local `node_modules` reflect the exact Credo `0.5.16` pin and the workspace remains runnable.

  $ /Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack
  $ pnpm --filter cts-3 run build:server
  Expected:
    TypeScript server build completes with no errors.

  $ /Users/Shel/.codex/worktrees/ba16/conformance-test-suite/conformance-stack
  $ pnpm validate
  Expected:
    Lint, typecheck, and test suite complete cleanly, or failures point to specific remaining parity gaps.

## Validation and Acceptance

Acceptance for the restart phase means:

- The current base remains buildable after each ported slice.
- The ported Credo slice produces observable runtime behavior, not just code presence.
- The ExecPlan records which old-branch code was reused and why.
- The baseline ACA-Py path remains unchanged in observable behavior unless the current base already changed it.

## Security, Privacy, and Tenant Isolation

No new multi-tenant storage or auth model is being introduced during the restart. Existing CTS and agent control assumptions remain in force. Any new logging added for parity debugging must stay focused on protocol records and avoid dumping secrets.

## Idempotence and Recovery

All discovery steps are read-only. Each implementation slice will be committed independently so it can be reverted or compared without losing unrelated work. Generated build artifacts must not be committed.

## Artifacts and Notes

Current base evidence:

  Branch:
    codex/credo-parity-pr29-base

  Base commit:
    0caae7f

  Old parity reference branch:
    feat/credo-parity-acapy-flows

## Interfaces and Dependencies

Current interfaces already in play on this base:

- `conformance-stack/packages/cts/server/server.ts` runtime bootstrap
- `conformance-stack/packages/cts/server/api.ts` CTS API surface
- `conformance-stack/docker-compose.yml` service orchestration

No new dependency decisions have been made yet for the restart. If the Credo control service is reintroduced on this base, its API contract will be documented here before final validation.
