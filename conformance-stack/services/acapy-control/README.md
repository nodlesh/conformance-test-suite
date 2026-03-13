# ACA-Py Control Service

This service wraps an ACA-Py process and exposes a lightweight control API for the
Conformance Test Suite (CTS).  It is derived from the OWF/OATH backchannel but
has been reorganized to remove the legacy HTTP surface area and to make it easy
to embed into CTS.

## Layout

```
acapy-control/
├── app/                 # FastAPI application entrypoint
├── acapy_controller/    # ACA-Py process manager + admin helpers
├── profiles/            # Example ACA-Py config files (YAML)
├── requirements.txt
└── Dockerfile           # (coming next steps)
```

## Running locally

```bash
cd conformance-stack/services/acapy-control
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 9001
```

The service exposes:

* `POST /agent/start` – launch ACA-Py with a named profile.
* `POST /agent/stop` – stop the managed ACA-Py instance.
* `POST /connections/create-invitation` – create an out-of-band invitation.
* `POST /proofs/request` – send a Present Proof v2 request.
* `POST /proofs/verify` – wait for and verify a proof exchange.
* `POST /credentials/offer` – issue a V2 credential offer.
* `POST /connections/wait` – block until a given connection reaches `active`.
* `GET /events/stream` – server-sent event stream for neutral events (agent start/stop, invitations, proofs, credentials).

The FastAPI app is the integration point for CTS; the TypeScript controller will
issue RPCs against these endpoints to drive ACA-Py in the same way it currently
drives Credo.

### TRQP problem-report enforcement (verifier)

When the managed ACA-Py is running in **verifier** mode, CTS can enforce Trust Registry checks
before verification. If TRQP authorization or recognition fails, the control service sends a
**Present Proof v2 problem report** to the holder with a generic message.

Enable this behavior with:

* `ACAPY_VERIFIER_TRQP_ENFORCE=true` (recommended; mandatory for CTS conformance runs)

### Logging and tracing env vars

The control service passes these environment variables through to the managed ACA-Py process:

* `ACAPY_LOG_LEVEL` (default in compose: `DEBUG`)
* `ACAPY_TRACE` (`true` enables ACA-Py tracing)
* `ACAPY_TRACE_TARGET` (default in compose: `log`)
* `ACAPY_TRACE_TAG` (default: `cts`)
* `ACAPY_TRACE_LABEL` (default: `cts-acapy`)
* `ACAPY_WEBHOOK_DUMP_PAYLOADS` (set to `true` to log full webhook payloads; summary logs are always on)

> **Networking note:** ACA-Py still hosts its DIDComm HTTP inbound transport on ports `8041/8042`. The compose service now publishes those ports (`8041:8041`, `8042:8042`) so you can point ngrok (or another tunnel) at them. Set `REFERENCE_AGENT_NGROK_DOMAIN` in the root `.env` so invitations reference the reachable HTTPS URL. If you force `REFERENCE_ISSUER_OVERRIDE_AGENT=credo`, also provide `ISSUER_OVERRIDE_NGROK_DOMAIN` for the Credo issuer tunnel. The legacy `ISSUER_NGROK_DOMAIN` / `VERIFIER_NGROK_DOMAIN` variables are still honored as fallbacks but the new names are preferred.
