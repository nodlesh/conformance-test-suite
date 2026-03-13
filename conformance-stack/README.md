# Ayra Conformance Test Suite - `conformance-stack`

`conformance-stack` is the primary CTS runtime stack (Next.js UI + Express API + test pipelines).

Coverage and capability status are maintained in the root README: `../README.md`.

## Use This With
- Root docs for full setup and env guidance: `../README.md`
- NGROK guidance: `./NGROK_SETUP.md`
- Package-level implementation docs: `./packages/cts/README.md`

## Quick Start
From the repo root:

```bash
cp .env.example .env
docker compose up --build app
```

Then open:
- `http://localhost:3000/holder`
- `http://localhost:3000/verifier`
- `http://localhost:3000/issuer`

Stop:

```bash
docker compose down
```

## Notes
- Configure all runtime values in the **root** `.env` file.
- TRQP checks in Holder/Verifier are controlled from the UI:
  - Enable TRQP
  - Select mode: `authorization`, `recognition`, or `both`
  - Optional policy overrides are under **Advanced Overrides**
- `Suggest from TR` is available when `NEXT_PUBLIC_TRQP_SUGGEST_FROM_TR_ENABLED=true`.

## DID:web Issuer
When using DID:web issuance, start with NGROK profile and ensure DID env values are set in root `.env`:

```bash
COMPOSE_PROFILES=with-ngrok docker compose up --build app ngrok acapy-control acapy-holder-control acapy-verifier-control
```

When finished, tear it down with the same profile so the profile-scoped `ngrok` container is removed:

```bash
COMPOSE_PROFILES=with-ngrok docker compose down -v
```
