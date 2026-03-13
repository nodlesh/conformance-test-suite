from __future__ import annotations

from fastapi import FastAPI
from datetime import datetime, timezone
import json
import logging
import os
import sys
from pathlib import Path

from acapy_controller.process_manager import AcaPyProcessManager
from acapy_controller.event_bus import EventBroker
from acapy_controller.rpc import RpcRouter

LOG_LEVEL = os.getenv("UVICORN_LOG_LEVEL", "info").upper()
logging.basicConfig(level=LOG_LEVEL, format="%(levelname)s:%(name)s:%(message)s")
logging.getLogger("acapy_controller").setLevel(LOG_LEVEL)
logging.getLogger("app").setLevel(LOG_LEVEL)

app = FastAPI(title="ACA-Py Control Service", version="0.1.0")
manager = AcaPyProcessManager()
event_broker = EventBroker()
rpc_router = RpcRouter(manager, event_broker)
app.include_router(rpc_router.router)
LOGGER = logging.getLogger(__name__)

_DUMP_WEBHOOK_PAYLOADS = os.getenv("ACAPY_WEBHOOK_DUMP_PAYLOADS", "false").lower() == "true"


def _first_present(payload: dict, *keys: str):
  for key in keys:
    value = payload.get(key)
    if value:
      return value
  return None


def _summarize_webhook(topic: str, body: dict) -> dict:
  return {
    "topic": topic,
    "connection_id": _first_present(body, "connection_id"),
    "thread_id": _first_present(body, "thread_id", "thid"),
    "proof_exchange_id": _first_present(
      body, "pres_ex_id", "presentation_exchange_id", "proof_exchange_id"
    ),
    "out_of_band_id": _first_present(body, "out_of_band_id", "oob_id"),
    "state": _first_present(body, "state", "presentation_state"),
    "received_at": datetime.now(timezone.utc).isoformat(),
  }

@app.on_event("startup")
async def auto_start_agent():
  """Auto-start the configured ACA-Py profile when the control service boots."""
  autostart = os.getenv("ACAPY_AUTOSTART", "true").lower() == "true"
  if not autostart:
    return
  profile_name = os.getenv("ACAPY_PROFILE") or "issuer"
  profile_path = Path(__file__).resolve().parent.parent / "profiles" / f"{profile_name}.yaml"
  try:
    await manager.start(profile_path)
    print(f"[control] ACA-Py agent started with profile '{profile_name}'")
  except Exception as exc:  # pylint: disable=broad-except
    print(f"[control] Failed to start ACA-Py agent for profile '{profile_name}': {exc}", file=sys.stderr)
    # Fail fast so container restart surfaces the issue
    raise

@app.post("/webhook")
async def webhook_handler(payload: dict):
  topic = payload.get("topic") or payload.get("state", "")
  body = payload.get("payload") or payload
  summary = _summarize_webhook(topic, body)
  LOGGER.info("Webhook received: %s", json.dumps(summary, sort_keys=True))
  if _DUMP_WEBHOOK_PAYLOADS:
    LOGGER.debug("Webhook payload: %s", json.dumps(body, sort_keys=True))
  try:
    manager.handle_webhook(topic, body)
    await manager.maybe_auto_verify_from_webhook(topic, body)
  except Exception:
    # best-effort; do not fail the webhook
    pass
  return {"status": "ok"}

# ACA-Py can be configured to POST to /webhook/topic/{topic}/...; accept that shape too.
@app.post("/webhook/topic/{topic}/")
async def webhook_topic_handler(topic: str, payload: dict):
  body = payload.get("payload") or payload
  summary = _summarize_webhook(topic, body)
  LOGGER.info("Webhook received: %s", json.dumps(summary, sort_keys=True))
  if _DUMP_WEBHOOK_PAYLOADS:
    LOGGER.debug("Webhook payload: %s", json.dumps(body, sort_keys=True))
  try:
    manager.handle_webhook(topic, body)
    await manager.maybe_auto_verify_from_webhook(topic, body)
  except Exception:
    pass
  return {"status": "ok"}
