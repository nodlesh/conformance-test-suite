# Ayra Card Schema Assets

This folder holds the Ayra Card artifacts pulled from `ayracardprotocol-concept/technical/schema`.

- `ayra-card-business-card-schema.json`: Current JSON Schema for the Ayra Business Card credential.
- `payload-schema-unified.json`: Unified payload schema referenced by the credential subject payloads.
- `example-ayra-card.json`: Example Verifiable Credential payload.
- `example-payload.json`: Example legacy payload (deprecated in favor of the unified payload schema).
- `SCHEMA-ALIGNMENT.md`: Notes from the upstream repo describing alignment decisions.

Once the files are in place, run the validation script from `packages/cts`:

```bash
pnpm --filter cts validate:ayra-card-context
```

You can override the defaults for the validation script:

```bash
pnpm --filter cts validate:ayra-card-context -- --schema schema/ayra-card-business-card-schema.json --sample schema/example-ayra-card.json --context schema/AyraBusinessCardV1R0.jsonld --context-url https://schema.affinidi.io/AyraBusinessCardV1R0.jsonld
```

The script will surface actionable messages if any file is missing or does not align. Update the files locally as the schema evolves.
