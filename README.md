# Ayra Trust Network - Conformance Test Suite

Conformance tooling for Ayra Trust Network implementations built on the `conformance-stack` stack (the production baseline).

**Current coverage**
- ✅ TRQP trust registry checks
- ✅ TRQP mode selection + optional policy field overrides in Holder/Verifier flows
- ✅ Holder conformance flow
- ✅ Verifier conformance flow
- ✅ Issue flow (utility flow, not scored as a conformance flow)
- ✅ Credential format: W3C VC (LDP)

## Overview

This repository contains conformance testing tools for validating digital identity implementations against Ayra Trust Network standards, focused on the `conformance-stack` stack.

## Repository Structure

```
conformance-test-suite/
├── conformance-stack/          # Primary CTS stack (Next.js + Express)
└── README.md                     # This file
```

## Conformance Stack

**Architecture**: Monolithic Next.js application with integrated testing and Express API.

**Status**: Production baseline for TRQP, holder, verifier, and issue flows with W3C VC (LDP) credentials.

#### Purpose
- Rapid iteration on conformance testing concepts
- Quick setup for demos and local validation
- Direct agent testing without external harnesses
- Development and debugging workflow validation

#### Key Features
- Single Next.js application serving both frontend and backend
- Integrated Express.js server for API endpoints
- Built-in test pipeline orchestration with DAG-based execution
- Direct integration with Credo-TS agents
- Real-time WebSocket updates for test monitoring
- QR code generation for mobile wallet testing

## Getting Started

### Prerequisites
- Node.js 18+
- pnpm 9.1.0+
- Docker & Docker Compose (recommended)

### Quick Start (Conformance Stack)

1) Clone and configure env
```bash
git clone <repository-url>
cd conformance-test-suite
cp .env.example .env
# Set NGROK domains/tokens and choose your agent: REFERENCE_AGENT=credo|acapy
```

2) Start with Credo Reference Agent(s) (default)
```bash
# Ensure REFERENCE_AGENT=credo in .env
docker compose up --build app
```

3) Start with ACA-Py Reference Agent(s) (alternate)
```bash
# Set REFERENCE_AGENT=acapy in .env and provide REFERENCE_AGENT_NGROK_DOMAIN
# Optionally set REFERENCE_ISSUER_OVERRIDE_AGENT/ISSUER_OVERRIDE_NGROK_DOMAIN if Credo issues
docker compose up --build acapy-control acapy-ngrok app
```

When finished:
```bash
docker compose down
```

**Required Environment Variables (in the repo root `.env`):**
```bash
USE_NGROK=true                        # Enable NGROK tunneling for CTS services
NGROK_AUTH_TOKEN=your_token_here      # NGROK authentication token (required when USE_NGROK=true)
REFERENCE_AGENT=credo|acapy           # Which agent drives holder/verifier flows
REFERENCE_AGENT_NGROK_DOMAIN=ref.example.ngrok.app   # Domain for the reference agent tunnel
VERIFIER_TEST_NGROK_DOMAIN=verifier.example.ngrok.app # Domain for the standalone test-verifier container
REFERENCE_ISSUER_OVERRIDE_AGENT=credo|acapy|auto # (optional) force the issuer controller
ISSUER_OVERRIDE_NGROK_DOMAIN=issuer.example.ngrok.app # Domain for the override issuer tunnel
SERVER_NGROK_DOMAIN=cts-server.example.ngrok.app      # Domain for API callbacks
CTS_ISSUER_DID_METHOD=key|web|webvh   # Issuer DID method (set to web for did:web issuance)
CTS_ISSUER_DID_OPTIONS={"did":"did:web:your.domain:issuer"} # Required when CTS_ISSUER_DID_METHOD=web
DID_WEB_NGROK_DOMAIN=issuer.example.ngrok.app          # Public domain for hosting the DID document
```

For NGROK domain planning, tunnel rotation, and the full list of optional variables see `conformance-stack/NGROK_SETUP.md`.

### Reference Agents & Issuer Override

- `REFERENCE_AGENT` selects which controller powers the holder and verifier flows. `credo` uses the built-in Credo agent; `acapy` connects to the ACA-Py control service.
- `REFERENCE_ISSUER_OVERRIDE_AGENT` (default `auto`) lets you force the credential issuer to Credo or ACA-Py independently of the reference agent. When set to `credo`, also provide `ISSUER_OVERRIDE_NGROK_DOMAIN` so the override agent has a unique tunnel; otherwise the UI QR codes collide.
- `REFERENCE_AGENT_NGROK_DOMAIN` is the hostname wallets use to reach the reference agent. When ACA-Py is the reference agent, the `acapy-ngrok` sidecar automatically advertises this domain.
- `VERIFIER_TEST_NGROK_DOMAIN` is only used by the standalone `test-verifier` container for scripted CLI checks; it does not affect the UI flows.

### TRQP Checks and Policy Settings

When TRQP checks are enabled, CTS runs with a selected TR policy mode:

- `authorization`: authorization checks only
- `recognition`: recognition checks only
- `both`: run both checks

In the Holder and Verifier UIs, users can optionally set:
- Authorization Action
- Authorization Resource
- Recognition Action
- Recognition Resource
- Recognition Capability (optional)

If these fields are left blank, CTS uses the current defaults for Ayra card checks:
- Authorization: `issue` on `ayracard:businesscard`
- Recognition: `member-of` on `ayratrustnetwork`

Usage:
- UI (Holder + Verifier): enable TRQP, choose `TRQP Mode`, then optionally fill the TR policy fields.
- Optional helper: set `NEXT_PUBLIC_TRQP_SUGGEST_FROM_TR_ENABLED=true` to show a `Suggest from TR` button next to the TRQP fields. Clicking it prefills values from trust-registry lookups; clicking `Revert Suggestion` restores your previous values.
- API:

```json
{
  "pipelineType": "VERIFIER_TEST",
  "verifyTRQP": true,
  "trqpMode": "both",
  "trqpPolicyProfile": {
    "authorization": {
      "action": "issue",
      "resource": "ayracard:businesscard"
    },
    "recognition": {
      "action": "member-of",
      "resource": "ayratrustnetwork",
      "capability": "manage-issuers:ayracard:businesscard"
    }
  }
}
```

Notes:
- `trqpPolicyProfile` is optional.
- Fields not supplied in `trqpPolicyProfile` fall back to defaults.
- Only checks selected by `trqpMode` are enforced.

### DID:web Issuer (optional)

When issuing W3C LDP credentials with a `did:web` issuer, the DID document must be hosted over HTTPS.

```bash
COMPOSE_PROFILES=with-ngrok docker compose up --build app ngrok acapy-control acapy-holder-control acapy-verifier-control
```

When finished, tear it down with the same profile so the profile-scoped `ngrok` service is removed too:

```bash
COMPOSE_PROFILES=with-ngrok docker compose down -v
```

The DID document is served by the CTS API (default `https://<domain>/issuer/did.json`) and is generated automatically on container start when `CTS_ISSUER_DID_METHOD` is `web` or `webvh`.

### Access Points (default ports)
- Frontend: http://localhost:3000
- API Server: http://localhost:5005
- Test Interfaces: http://localhost:3000/holder, /verifier, /issuer, /registry

## Contributing

### Contribution Guidelines

1. **Fork and clone** the repository
2. **Create a feature branch** for your changes
3. **Test thoroughly** in development environment
4. **Document any breaking changes**
5. **Submit pull request** with clear description

### Code Quality Expectations

- Fast iteration with production hardening underway

## Security Considerations

> 🔒 **Security Notes**
> 
> Designed for controlled development environments; add hardening and authentication before internet exposure.

### Known Security Issues
- No authentication or authorization mechanisms
- Unvalidated user inputs in many areas
- Potential injection vulnerabilities
- Insecure default configurations
- Missing rate limiting and DoS protection
- Unencrypted sensitive data transmission
- Debug information exposed in production builds

### Security Recommendations
- Use only in isolated development environments
- Do not expose to public networks
- Do not process real credentials or sensitive data
- Implement proper security measures before any production use

## License

Licensed under the Apache License 2.0. See [LICENSE](./LICENSE) for details.

---

## Support and Feedback

### Getting Help
- 📚 **Documentation**: Check README files under `conformance-stack/`
- 🐛 **Issues**: Report bugs and issues via GitHub Issues
- 💬 **Discussions**: Use GitHub Discussions for questions and feedback

### Feedback Welcome
Tell us what works and what could be smoother:
- What works well?
- What breaks frequently?
- What features are missing?
- How can the architecture be improved?
