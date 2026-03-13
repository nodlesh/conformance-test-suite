# Ayra Card Schema Alignment Summary

**Date:** 2025-11-05
**Status:** ✅ Complete

## Overview

This document summarizes the schema alignment work completed to ensure consistency between the conceptual documentation ([schemaconcept.md](../../concepts/ayracard-credentialtypes/schemaconcept.md)) and the JSON Schema implementation ([ayra-card-schema.json](./ayra-card-schema.json)).

## Changes Made

### 1. File Renaming

**Fixed typo in filename:**
- `arya-card-schema.json` (incorrect spelling) -> `ayra-card-schema.json` (correct spelling)

### 2. JSON Schema Updates

Added missing required fields to `ayra-card-schema.json`:

#### New Fields Added:
- `ayra_trust_network_did` (string, URI format) - DID for Ayra Trust Network
- `company_display_name` (string) - Company/organization name
- `phone` (string) - Phone number
- `person_name` (string) - Full name of person
- `title` (string) - Job title/role

#### Enhanced Field Definitions:
- Added `format: "uri"` for DID fields (`ayra_trust_network_did`, `ecosystem_id`, `issuer_id`, `authority_trust_registry`)
- Added `format: "email"` for email field
- Added semantic versioning pattern for version fields (`^\d+\.\d+\.\d+$`)
- Added `type: ["string", "integer"]` for `ayra_assurance_level`
- Added descriptions and examples to all fields

#### Updated Required Fields:
```json
"required": [
  "ayra_trust_network_did",
  "ayra_card_type",
  "ayra_card_version",
  "ayra_card_type_version",
  "authority_trust_registry",
  "ecosystem_id",
  "issuer_id"
]
```

### 3. Markdown Documentation Updates

Updated [schemaconcept.md](../../concepts/ayracard-credentialtypes/schemaconcept.md) with:

#### Added Sections:
- **Naming Conventions** - Documented snake_case, `_did` suffix usage
- **W3C VCDM 2.0 Mapping** - Complete mapping table between Ayra Card and W3C VCDM
- **Proper Field Typing** - Added types, formats, and requirements to all fields
- **Business Card Specific Fields** - Organized employer-issued and self-issued variants
- **Staff Pass Fields** - Documented proposed schema (marked as NOTIONAL)

#### Field Documentation Format:
All fields now documented with:
- **Type** (string, integer, array, etc.)
- **Format** (URI, email, date-time, etc.)
- **Requirement Level** (REQUIRED, RECOMMENDED, OPTIONAL)
- **Description** - Clear explanation
- **Examples** - Concrete examples where applicable
- **Notes** - Important usage notes

#### Fixed Naming Inconsistencies:
- `displayname` → `display_name`
- `expire_datetime` → Use W3C VCDM `validUntil`
- `ecosystem_did` → `ecosystem_id` (per naming decision)
- `person name` → `person_name`

### 4. Payload Schema Unification

Created unified payload schema to resolve conflicts between two different payload specifications:

**Files:**
- **NEW:** `payload-schema-unified.json` - Unified schema aligned with `ayra-card-schema.json`
- **DEPRECATED:** `payload-schema.json` - Old schema using `payloadID`, `payloadType`, `payloadData`

**Unified Payload Structure:**
```json
{
  "id": "string (pattern: ^[a-zA-Z0-9_-]+$)",
  "type": "string (max 255 chars)",
  "format": "string (max 255 chars)",
  "data": "string",
  "description": "string (optional)"
}
```

**Required fields:** `id`, `type`, `format`, `data`

### 5. Schema Mapping Table

Added comprehensive W3C VCDM 2.0 mapping table:

| Ayra Card Concept | W3C VCDM Field | Location | Type |
|-------------------|----------------|----------|------|
| Credential ID | `id` | Top-level | URI |
| Context | `@context` | Top-level | Array |
| Credential Types | `type` | Top-level | Array |
| Issuer DID | `issuer.id` | Top-level | URI |
| Issue Date | `validFrom` | Top-level | datetime |
| Expiration | `validUntil` | Top-level | datetime |
| Subject DID | `credentialSubject.id` | credentialSubject | URI |
| Ayra fields | Various | credentialSubject | Various |

## Naming Conventions (Standardized)

### Confirmed Standards:

- **Field Naming:** snake_case with underscores
- **DID Fields:** Use `_did` suffix (e.g., `ayra_trust_network_did`)
- **Non-DID IDs:** Use `_id` suffix (e.g., `ecosystem_id`, `issuer_id`)
- **Ayra-Governed:** Use `ayra_` prefix (e.g., `ayra_card_type`)
- **Non-Ayra Fields:** No prefix (e.g., `display_name`, `email`)

### Examples:
- `ayra_trust_network_did` (Ayra-governed DID)
- `ayra_card_type` (Ayra-governed field)
- `ecosystem_id` (non-Ayra field, contains DID but uses _id for consistency)
- `display_name` (non-Ayra field, not a DID)
  - `displayname`, `display-name`, `DisplayName` (incorrect formats)

## Key Decisions Documented

1. **`ecosystem_id` vs `ecosystem_did`:** Using `ecosystem_id` for consistency, though it contains a DID
2. **Expiration field:** Use W3C VCDM `validUntil` (top-level), NOT `expire_datetime` in credentialSubject
3. **Deep links:** Should be in payloads, NOT direct credentialSubject fields
4. **Issuer duplication:** `issuer_id` duplicates top-level `issuer.id` but included in credentialSubject for convenience
5. **Payload schema:** Unified to embedded structure (id, type, format, data, description)

## Files Updated

### JSON Schema Files:
- `ayra-card-schema.json` - Renamed and updated with all missing fields
- `payload-schema-unified.json` - NEW unified payload schema
- `payload-schema.json` - Marked as DEPRECATED

### Markdown Documentation:
- `concepts/ayracard-credentialtypes/schemaconcept.md` - Complete rewrite with proper typing

### Example Files:
- `example-ayra-card.json` - No changes needed (already compliant)


## Next Steps / Recommendations

### Immediate:
1. Update any code referencing old `arya-card-schema.json` filename
2. Migrate from `payload-schema.json` to `payload-schema-unified.json`
3. Review `issued_under_assertion_id` - currently crossed out in docs but present in example

### Short-term:
1. Add validation for semantic version format in implementations
2. Consider structured name fields (given_name, family_name) for `person_name`
3. Finalize Staff Pass schema (currently NOTIONAL)
4. Add JSON Schema validation tests

### Long-term:
1. Consider OCA (Overlays Capture Architecture) for branding/logos
2. Define assurance level values and their meanings
3. Create governance around managed payload types
4. Develop conformance test suite for schema validation

## References

- **W3C VCDM 2.0:** https://www.w3.org/TR/vc-data-model-2.0/
- **Semantic Versioning:** https://semver.org/
- **JSON Schema:** https://json-schema.org/
- **TRQP Specification:** https://trustoverip.github.io/tswg-trust-registry-protocol/

## Change History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-11-05 | 1.0 | Initial alignment completed | Claude Code |

