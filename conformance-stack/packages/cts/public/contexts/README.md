# Ayra Card Context Hosting

Place the Ayra Card JSON-LD context here so it is served by the Next.js app at:

- Local dev: `http://localhost:3000/contexts/ayra-card-v1.jsonld`
- Production: whichever host you deploy, keeping the same path.

File name convention:
- `ayra-card-v1.jsonld` (or increment the suffix when you rev the context)

Do **not** commit unpublished contexts unless they are approved for release. The validation script expects this file when you run:

```bash
pnpm --filter cts validate:ayra-card-context
```
