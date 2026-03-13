#!/usr/bin/env bash
set -euo pipefail

CONTROL_URL="${ACAPY_CONTROL_URL:-http://localhost:9001}"
PRES_EX_ID="${PRES_EX_ID:-demo-pres-ex-id}"
STATE="${STATE:-presentation-received}"
UPDATED_AT="${UPDATED_AT:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"

payload=$(
  cat <<EOF
{
  "payload": {
    "pres_ex_id": "${PRES_EX_ID}",
    "state": "${STATE}",
    "updated_at": "${UPDATED_AT}",
    "role": "verifier",
    "thread_id": "${PRES_EX_ID}"
  }
}
EOF
)

echo "Posting duplicate present_proof_v2_0 webhooks to ${CONTROL_URL}"
echo "$payload" | curl -sS -X POST "${CONTROL_URL}/webhook/topic/present_proof_v2_0/" \
  -H "Content-Type: application/json" -d @- >/dev/null
echo "$payload" | curl -sS -X POST "${CONTROL_URL}/webhook/topic/present_proof_v2_0/" \
  -H "Content-Type: application/json" -d @- >/dev/null

echo "Done. Check control-service logs to confirm the duplicate event was ignored."
