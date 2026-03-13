# Verifier Proof Record Flake Notes

## Symptoms
- Holder ACA-Py log: `StorageNotFoundError: Record not found: pres_ex_v20/<pres_ex_id>` in present_proof v2 ACK handler.
- CTS error: `Verifier record disappeared before verified=true` (lastState=presentation-sent).

## Root Cause Summary
- Present-proof v2 records were sometimes auto-removed or ACKed multiple times while CTS was still waiting.
- Duplicate webhook deliveries could trigger duplicate verify/ACK attempts, causing ACA-Py to delete the record twice.

## Changes Applied
- Holder send-presentation calls now pass `auto_remove=false` to keep records during CTS verification.
- acapy-control verifier logic is idempotent:
  - duplicate present_proof_v2_0 webhook events are deduplicated
  - verification/ACK is attempted only once per exchange id
- CTS waits tolerate a short grace window when records momentarily disappear and logs structured state snapshots.

## Repro Script
Use `conformance-stack/services/acapy-control/scripts/simulate-duplicate-proof-webhook.sh` to post duplicate webhook payloads and confirm that the control service ignores the duplicate.

## ACA-Py DIF Schema Crash (Issue #4006)
- ACA-Py present-proof v2 DIF handler throws `AttributeError: 'NoneType' object has no attribute 'uri_groups'` if `input_descriptors[].schema` is omitted.
- This crashes `POST /present-proof-2.0/records/{pres_ex_id}/send-presentation` even when a matching credential is selected.
- Workaround: include a minimal schema array using the expanded type URI (e.g., `https://schema.affinidi.io/AyraBusinessCardV1R0.jsonld`).
- When https://github.com/openwallet-foundation/acapy/issues/4006 is fixed, we can remove schema and rely on constraints only.
