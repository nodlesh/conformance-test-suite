# CTS Holder FAQ
## Testing Holder Conformance in the Ayra Trust Network

This document answers common questions from the perspective of a **Holder implementation** being tested against the Ayra Conformance Test Suite (CTS).
It focuses on what the current CTS **holder flow** actually does, how trust and authorization are enforced, and how TRQP and the Ayra Trust Registry factor into holder conformance.

This is a practical guide. It assumes you already have a holder or wallet implementation and want to understand how CTS evaluates it today.

---

## 1. What does it mean to test a Holder in CTS?

**Short answer**  
CTS runs a holder conformance flow where CTS acts as the verifier and sends a Present Proof v2 request to your wallet. The run passes or fails based on whether the verifier accepts the presentation and (optionally) whether TRQP checks succeed. In the ACA-Py verifier path, CTS explicitly waits for `verified === true` before passing the run.

CTS is not testing whether:
- Your UI is good
- Your wallet is user-friendly
- You support every VC feature

CTS *is* testing whether:
- Your holder completes the DIDComm v2 Present Proof v2 flow
- Your holder can present the requested credential format
- Your holder fails when the verifier rejects the presentation
- TRQP checks fail the run when enabled and negative

---

## 2. What roles does a Holder play in CTS flows?

In the holder conformance flow, a holder is expected to:

- Store credentials without mutating governed data
- Respond correctly to a Present Proof v2 request
- Present only credentials that satisfy the request

CTS never asks a holder to:
- Make trust decisions on behalf of a verifier
- Bypass governance or registry checks
- Infer missing authorization context

---

## 3. Does CTS test issuance to the Holder?

Indirectly, and only as a prerequisite.

CTS provides issuance **utility flows** so you can load a credential into a wallet before running the holder test:
- **W3C LDP issuance** is available via the ACA-Py-only issue flow (Ayra Business Card LDP VC). This flow issues an Ayra Business Card with `ecosystem_id` and `ayra_trust_network_did` so TRQP mapping can be derived from the credential.

CTS does not score issuance as holder conformance. The holder test assumes the credential already exists and focuses on the Holder-Verifier interaction.

---

## 4. How do I begin and run the CTS as a holder?

You can start a holder run in a few steps:
1. Start CTS and the reference agent per `README.md`.
2. Open the CTS UI at `http://localhost:3000` and select the Holder flow.
3. If your wallet does not already have an Ayra Business Card, run the Issue flow to load one.
4. Start the Holder test flow and scan the invitation QR with your wallet.
5. If TRQP enforcement is required, enable `verifyTRQP` and ensure DID resolution/TRQP are reachable.

---

## 5. Does the Holder validate issuer authorization at issuance time?

Not necessarily. The holder conformance flow does **not** require or check that the holder evaluated issuer authorization at issuance time. When TRQP checks are enabled, authorization and recognition are enforced by the verifier **after** presentation.

---

## 6. Does a Holder need to consult a Trust Registry directly?

No.

In the current CTS holder flow:
- TRQP calls are made by the verifier, not by the holder
- The holder is not expected to query the trust registry

Holder conformance is evaluated on:
- Correct protocol behavior (Present Proof v2 over DIDComm v2)
- Correct presentation construction that satisfies the request

---

## 7. What is TRQP and how does it relate to Holder conformance?

**TRQP (Trust Registry Query Protocol)** is used by the verifier to query the Ayra Trust Registry for issuer authorization and recognition.

In the CTS holder flow:
- TRQP is invoked by the verifier after receiving the presentation
- The holder is not expected to call TRQP or interpret registry results

TRQP checks, when enabled, are performed using the credential's issuer DID and credentialSubject fields (`ecosystem_id`, `ayra_trust_network_did`, `ayra_card_type`).

---

## 8. When are TRQP checks enforced?

TRQP checks run only when:
- The holder flow is started with `verifyTRQP=true` (UI toggle or API param)
- When enabled, CTS evaluates both authorization and recognition in the same run and reports combined failures when both are non-conformant

**Where the TRQP endpoint comes from depends on the verifier path (PR #19):**
- **ACA-Py verifier path**: CTS resolves the TRQP endpoint from the credential's `credentialSubject.ecosystem_id` DID document. The DID must publish a TRQP service (`TRQP` or `TrustRegistryService`). If the service endpoint is itself a DID, CTS resolves that DID to find the final TRQP URL. DID resolution uses `NEXT_PUBLIC_DID_RESOLVER_URL` (defaulting to the public uniresolver).
- **Other verifier paths**: CTS uses `NEXT_PUBLIC_TRQP_KNOWN_ENDPOINT` or `NEXT_PUBLIC_TRQP_LOCAL_URL`. If a presentation payload is available, CTS expects TRQP mapping via `TRQP_ENTITY_ID`, `TRQP_AUTHORITY_ID`, `TRQP_ACTION`, `TRQP_RESOURCE` (optional `TRQP_CONTEXT_JSON`). If no payload is available, TRQP checks are skipped.

---

## 9. What is the Ayra Trust Registry (Ayra TR)?

The Ayra Trust Registry is the authoritative source of issuer authorization within the Ayra Trust Network.

It:
- Defines who is allowed to issue which credentials
- Is queried via TRQP during CTS flows when TRQP checks are enabled

CTS treats the Ayra TR as authoritative when TRQP checks are enabled.

---

## 10. What happens if the Ayra Trust Registry is unreachable?

When TRQP checks are enabled:
- If DID resolution fails or the ecosystem DID does not expose a TRQP service, CTS expects the flow to fail.
- If a TRQP endpoint is configured but unreachable, CTS expects the flow to fail.
- The verifier must not silently proceed.

When TRQP checks are disabled, CTS skips TRQP checks. In verifier paths that do not return a presentation payload, TRQP checks are also skipped.

---

## 11. What does the holder test actually request?

The holder flow always uses **DIDComm v2 Present Proof v2**, and the current conformance target is **W3C LDP**:

- DIF presentation definition (`ldp_vp`) requesting an Ayra Business Card with **Ed25519Signature2020**.

If your wallet cannot present the requested format, the holder test will fail.

---

## 12. Which Present Proof protocol versions are accepted?

**Present Proof v2 only.**  
Present Proof v1 is not supported by the CTS holder flow.

---

## 13. Does CTS test presentation request handling in detail?

CTS relies on the reference verifier to validate that the presentation satisfies the request. In the ACA-Py verifier path, CTS explicitly waits for `verified === true` before passing the step and then runs TRQP checks if enabled. CTS does not independently validate selective disclosure or canonicalization beyond what the verifier accepts and the TRQP checks enforce.

If the verifier rejects the presentation, the holder test fails.

---

## 14. Does CTS test proof formats used by the Holder?

Yes, but only the formats used by the current holder flow.

Today the holder flow supports **W3C LDP** presentations with **Ed25519Signature2020**.

---

## 15. What about Credo?

Credo is currently used for demo purposes and supports AnonCreds. Moving Credo to W3C LDP (like the ACA-Py path) requires additional work. CTS does **not** certify AnonCreds.

---

## 16. How does CTS handle DIDComm 2 vs OID4VC for Holders?

The conformance-stack holder flow uses **DIDComm v2 Present Proof v2** only. OID4VC holder tests are **not** part of this flow, but are potentially on the roadmap.

---

## 17. What are common reasons Holder tests fail?

The most common failures are:

- The wallet never establishes the DIDComm connection
- The presentation request is not satisfied (wrong type or proof suite)
- The verifier rejects the presentation
- TRQP authorization/recognition fails (when enabled)
- TRQP endpoint is unreachable (when enabled)
- TRQP mapping fails due to missing fields in the credential (`ecosystem_id`, `ayra_trust_network_did`, `ayra_card_type`)
- DID resolution fails or the ecosystem DID document lacks a TRQP service
- The holder does not have the requested credential

Most failures are behavioral or format-related, not cryptographic.

---

## 18. Does a CTS pass mean my Holder is certified?

No.

A pass means:
- Your holder behaved correctly for the tested role
- Under the tested profile
- In the tested flow

It does not imply global certification or endorsement.

---

## 19. What should I do if my Holder fails CTS?

You should:
1. Read the failure reason in the UI
2. Check CTS server logs
3. Check the reference agent logs
4. If TRQP is enabled, check 
5. Re-run the test after fixing behavior

CTS failures are deterministic when configuration and credentials are unchanged.

---

## 20. Where should Holder-specific questions go?

- Conceptual questions -> GitHub Discussions
- Suspected CTS defects -> GitHub Issues (include logs)
- Specification clarifications -> Reference the active profile

This document defines expected Holder behavior under the current CTS holder flow.
