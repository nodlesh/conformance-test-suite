from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import signal
from pathlib import Path
from typing import Optional, Any

import httpx
from httpx import HTTPStatusError
import time

from .config import ProfileConfig, load_profile

LOGGER = logging.getLogger(__name__)


class AcaPyProcessManager:
  """Launch and manage a single ACA-Py process plus its admin client."""

  def __init__(self) -> None:
    self._process: Optional[asyncio.subprocess.Process] = None
    self._profile: Optional[ProfileConfig] = None
    # Track connection lifecycle based on webhooks to avoid long polling timeouts.
    self._active_connections: set[str] = set()
    self._invitation_map: dict[str, str] = {}
    self._oob_by_invitation: dict[str, str] = {}
    # Track presentations we've already attempted to verify (verifier demo mode)
    self._auto_verified_presentations: set[str] = set()
    # Dedupe webhook events by exchange/state/timestamp to keep handlers idempotent.
    self._proof_event_cache: dict[str, float] = {}
    # Dedupe problem reports to avoid sending multiple for the same exchange.
    self._problem_report_cache: dict[str, float] = {}

  def _dedupe_proof_event(self, pres_ex_id: str, state: str, updated_at: Optional[str]) -> bool:
    """Return True if this webhook event appears to be a duplicate."""
    if not pres_ex_id or not state:
      return False
    key = f"{pres_ex_id}|{state}|{updated_at or ''}"
    now = time.time()
    last = self._proof_event_cache.get(key)
    if last and (now - last) < 300:
      return True
    self._proof_event_cache[key] = now
    if len(self._proof_event_cache) > 2000:
      cutoff = now - 900
      self._proof_event_cache = {k: v for k, v in self._proof_event_cache.items() if v >= cutoff}
    return False

  def _should_skip_problem_report(self, proof_exchange_id: str) -> bool:
    if not proof_exchange_id:
      return False
    now = time.time()
    last = self._problem_report_cache.get(proof_exchange_id)
    if last and (now - last) < 300:
      return True
    self._problem_report_cache[proof_exchange_id] = now
    if len(self._problem_report_cache) > 2000:
      cutoff = now - 900
      self._problem_report_cache = {k: v for k, v in self._problem_report_cache.items() if v >= cutoff}
    return False

  @property
  def admin_url(self) -> str:
    if not self._profile:
      raise RuntimeError("ACA-Py not started")
    return self._profile.admin_url

  @property
  def is_running(self) -> bool:
    return self._process is not None

  async def start(self, profile_path: Path) -> ProfileConfig:
    if self._process:
      await self.stop()

    profile = load_profile(profile_path)
    cmd = profile.to_cli_args()
    LOGGER.info("Starting ACA-Py with command: %s", " ".join(cmd))
    self._process = await asyncio.create_subprocess_exec(*cmd)
    self._profile = profile

    await self._wait_for_admin()
    return profile

  async def stop(self) -> None:
    if not self._process:
      return

    LOGGER.info("Stopping ACA-Py process")
    self._process.send_signal(signal.SIGTERM)
    try:
      await asyncio.wait_for(self._process.wait(), timeout=15)
    except asyncio.TimeoutError:
      LOGGER.warning("ACA-Py did not terminate in time; killing")
      self._process.kill()
      await self._process.wait()
    finally:
      self._process = None
      self._profile = None

  async def create_invitation(self, multi_use: bool = False) -> dict:
    if not self._profile:
      raise RuntimeError("ACA-Py not started")

    async with httpx.AsyncClient() as client:
      resp = await client.post(
        f"{self.admin_url}/out-of-band/create-invitation",
        json={
          "handshake_protocols": [
            "https://didcomm.org/didexchange/1.0",
            "https://didcomm.org/didexchange/1.1",
          ],
          "use_public_did": False,
          "multi_use": multi_use,
          "create_connection": True,
        },
      )
      resp.raise_for_status()
      data = resp.json()
      invitation = data.get("invitation") or {}
      invitation_msg_id = invitation.get("@id") or invitation.get("id")
      oob_id_value = data.get("oob_id") or data.get("out_of_band_id")
      if invitation_msg_id and oob_id_value:
        self._oob_by_invitation[invitation_msg_id] = oob_id_value
      return {
        "invitation_url": data.get("invitation_url"),
        "connection_id": data.get("connection_id"),
        "out_of_band_id": data.get("out_of_band_id") or data.get("oob_id"),
        "oob_id": data.get("oob_id") or data.get("out_of_band_id"),
        "invitation": data.get("invitation"),
      }

  async def receive_invitation(
    self,
    invitation: dict,
    *,
    auto_accept: Optional[bool] = None,
    use_existing_connection: Optional[bool] = None,
  ) -> dict:
    """Accept an invitation (OOB 1.1 or RFC0160 connection invitation)."""
    if not self._profile:
      raise RuntimeError("ACA-Py not started")

    payload = dict(invitation)
    invitation_type = payload.get("@type") or payload.get("type") or ""
    invitation_type = str(invitation_type)

    async with httpx.AsyncClient() as client:
      # Route based on invitation type:
      # - OOB invitations go to /out-of-band/receive-invitation
      # - RFC0160 connection invitations go to /connections/receive-invitation
      if "out-of-band" in invitation_type:
        if auto_accept is not None:
          payload["auto_accept"] = auto_accept
        if use_existing_connection is not None:
          payload["use_existing_connection"] = use_existing_connection
        resp = await client.post(
          f"{self.admin_url}/out-of-band/receive-invitation",
          json=payload,
        )
      else:
        # Don't inject OOB-only fields into RFC0160 invitation payload.
        resp = await client.post(
          f"{self.admin_url}/connections/receive-invitation",
          json=payload,
        )
      resp.raise_for_status()
      data = resp.json()
      return data.get("result") or data

  async def request_proof(self, body: dict) -> dict:
    if not self._profile:
      raise RuntimeError("ACA-Py not started")

    payload = self._build_presentation_request_payload(body)

    async with httpx.AsyncClient() as client:
      resp = await client.post(
        f"{self.admin_url}/present-proof-2.0/send-request",
        json=payload,
      )
      resp.raise_for_status()
      record = resp.json()
      proof_exchange_id = (
        record.get("proof_exchange_id")
        or record.get("presentation_exchange_id")
        or record.get("pres_ex_id")
      )
      if not proof_exchange_id:
        raise RuntimeError("ACA-Py response missing proof exchange id")
      record["proof_exchange_id"] = proof_exchange_id
      record.setdefault(
        "state",
        record.get("presentation_state")
        or record.get("presentation_exchange_state")
        or "request-sent",
      )
      # Demo helper: if this control service is running the verifier profile,
      # proactively verify+ACK in the background. This avoids relying on webhook payload
      # shapes and ensures the prover reaches `done`.
      if "VERIFIER" in (self._profile.label or "").upper():
        connection_id = payload.get("connection_id")
        asyncio.create_task(self._auto_verify_exchange(proof_exchange_id, connection_id))
      return record

  async def _auto_verify_exchange(self, proof_exchange_id: str, connection_id: Optional[str]) -> None:
    try:
      # Small delay so the exchange record exists and the prover has time to respond.
      await asyncio.sleep(1.0)
      record = await self.wait_for_proof(
        proof_exchange_id,
        timeout_ms=180000,
        connection_id=connection_id,
      )
      state = (record.get("state") or record.get("presentation_state") or "").replace("_", "-")
      if state in {"done", "abandoned"}:
        return
      if state == "presentation-received":
        await self.verify_proof(proof_exchange_id, connection_id=connection_id)
    except Exception as exc:  # pylint: disable=broad-except
      LOGGER.warning("Background auto-verify failed for %s: %s", proof_exchange_id, exc)

  async def offer_credential(self, body: dict) -> dict:
    if not self._profile:
      raise RuntimeError("ACA-Py not started")

    # The CTS control API accepts a simplified offer payload:
    #   { connection_id, credential_definition_id, attributes, protocol_version }
    # ACA-Py issue-credential v2 expects a "filter" + "credential_preview".
    connection_id = body.get("connection_id")
    if not connection_id:
      raise ValueError("connection_id is required to send a credential offer")

    if body.get("filter"):
      payload = body
    else:
      cred_def_id = body.get("credential_definition_id") or body.get("cred_def_id")
      if not cred_def_id:
        raise ValueError("credential_definition_id is required to send a credential offer")

      raw_attrs = body.get("attributes") or {}
      if isinstance(raw_attrs, list):
        attributes = raw_attrs
      elif isinstance(raw_attrs, dict):
        attributes = [{"name": k, "value": str(v)} for k, v in raw_attrs.items()]
      else:
        raise ValueError("attributes must be an object map or a list of {name,value}")

      # If cred_def_id is an AnonCreds-style identifier (e.g. did:indy:.../anoncreds/v0/CLAIM_DEF/...),
      # ACA-Py expects it under the `anoncreds` filter; legacy Indy identifiers use `indy`.
      filter_key = "anoncreds" if (isinstance(cred_def_id, str) and (cred_def_id.startswith("did:") or "/anoncreds/" in cred_def_id)) else "indy"

      payload = {
        "connection_id": connection_id,
        "credential_preview": {
          "@type": "issue-credential/2.0/credential-preview",
          "attributes": attributes,
        },
        # ACA-Py 1.4 expects `filter` with `indy` for anoncreds-style credentials.
        "filter": {filter_key: {"cred_def_id": cred_def_id}},
        "auto_remove": True,
      }

    async with httpx.AsyncClient() as client:
      resp = await client.post(
        f"{self.admin_url}/issue-credential-2.0/send-offer",
        json=payload,
      )
      resp.raise_for_status()
      return resp.json()

  async def wait_for_connection(self, connection_id: str, timeout_ms: int = 240000) -> dict:
    deadline = time.monotonic() + timeout_ms / 1000
    while time.monotonic() < deadline:
      if connection_id in self._active_connections:
        record = await self.get_connection(connection_id)
        if record:
          return record
        # Webhook told us it's active but record lookup failed; return a minimal record.
        return {"connection_id": connection_id, "state": "active"}
      record = await self.get_connection(connection_id)
      if not record:
        await asyncio.sleep(1)
        continue
      state = record.get("state") or record.get("rfc23_state")
      LOGGER.info("Connection %s state=%s", connection_id, state)
      if state in {"active", "completed"}:
        return record
      await asyncio.sleep(1)
    raise RuntimeError(f"Connection {connection_id} did not become active in time")

  async def wait_for_oob_connection(self, oob_id: str, timeout_ms: int = 240000) -> dict:
    deadline = time.monotonic() + timeout_ms / 1000
    connection_id: Optional[str] = self._invitation_map.get(oob_id)
    while time.monotonic() < deadline:
      # Refresh mapping from any webhook-derived data
      connection_id = self._invitation_map.get(oob_id) or connection_id
      if connection_id:
        try:
          return await self.wait_for_connection(
            connection_id,
            int((deadline - time.monotonic()) * 1000),
          )
        except Exception:
          # fall through and keep polling
          pass

      record = await self.get_oob_record(oob_id)
      connection_id = (
        record.get("connection_id")
        or self._invitation_map.get(oob_id)
        or connection_id
      )
      # Some versions expose 'state' or 'trace' but no connection yet; check state for completeness
      oob_state = record.get("state") or record.get("oob_state")
      if oob_state and oob_state in {"done", "completed"} and connection_id:
        try:
          return await self.wait_for_connection(
            connection_id,
            int((deadline - time.monotonic()) * 1000),
          )
        except Exception:
          pass
      await asyncio.sleep(1)
    raise RuntimeError(f"OOB {oob_id} did not yield an active connection in time")

  def handle_webhook(self, topic: str, body: dict) -> None:
    topic = (topic or "").replace("-", "_")
    if topic == "connections":
      state = body.get("state") or body.get("rfc23_state")
      conn_id = body.get("connection_id")
      invitation_msg_id = body.get("invitation_msg_id") or body.get("invi_msg_id")
      oob_id = body.get("oob_id") or body.get("out_of_band_id")
      if invitation_msg_id and conn_id:
        self._invitation_map[invitation_msg_id] = conn_id
        if invitation_msg_id in self._oob_by_invitation:
          self._invitation_map[self._oob_by_invitation[invitation_msg_id]] = conn_id
      if oob_id and conn_id:
        self._invitation_map[oob_id] = conn_id
      if state in {"active", "completed"} and conn_id:
        self._active_connections.add(conn_id)
    elif topic in {"out_of_band", "out_of_band_v1_1", "out_of_band_v1"}:
      state = body.get("state") or body.get("oob_state")
      conn_id = body.get("connection_id")
      oob_id = body.get("oob_id") or body.get("out_of_band_id") or body.get("invitation_id")
      invitation_msg_id = body.get("invitation_msg_id") or body.get("invi_msg_id")
      if invitation_msg_id and conn_id:
        self._invitation_map[invitation_msg_id] = conn_id
        if invitation_msg_id in self._oob_by_invitation:
          self._invitation_map[self._oob_by_invitation[invitation_msg_id]] = conn_id
      if oob_id and conn_id:
        self._invitation_map[oob_id] = conn_id
      if state in {"done", "completed"} and conn_id:
        self._active_connections.add(conn_id)

  async def maybe_auto_verify_from_webhook(self, topic: str, body: dict) -> None:
    """Webhook hook for verifier demo agent.

    Auto-verify is disabled; verification is triggered explicitly via /proofs/verify.
    """
    # Verification is now triggered explicitly via /proofs/verify to avoid duplicate
    # verify-presentation calls. Keep this hook as a no-op.
    return
    if not self._profile:
      return

    if "VERIFIER" not in (self._profile.label or "").upper():
      return

    normalized = (topic or "").replace("-", "_")
    if normalized not in {"present_proof_v2_0"}:
      return

    state = body.get("state") or body.get("presentation_state")
    role = (body.get("role") or "").lower()
    normalized_state = (state or "").replace("_", "-")
    # Some ACA-Py webhook payloads omit `role`; since this control service is only
    # running in verifier demo mode (checked above by label), treat missing role as verifier.
    if normalized_state != "presentation-received" or (role and role != "verifier"):
      return

    pres_ex_id = (
      body.get("pres_ex_id")
      or body.get("presentation_exchange_id")
      or body.get("proof_exchange_id")
      or body.get("thread_id")
    )
    if not pres_ex_id or pres_ex_id in self._auto_verified_presentations:
      return

    updated_at = body.get("updated_at") or body.get("created_at") or body.get("timestamp")
    if self._dedupe_proof_event(pres_ex_id, normalized_state, str(updated_at) if updated_at else None):
      LOGGER.info("Duplicate present_proof_v2_0 webhook ignored (pres_ex_id=%s, state=%s)", pres_ex_id, normalized_state)
      return

    self._auto_verified_presentations.add(pres_ex_id)
    try:
      resolved = await self._resolve_pres_ex_id(pres_ex_id)
      if not resolved:
        LOGGER.info("Auto-verify skipped; could not resolve pres_ex_id=%s", pres_ex_id)
        return
      # Only verify if the record is still awaiting verification.
      try:
        record = await self.get_proof(resolved)
        record_state = (record.get("state") or record.get("presentation_state") or "").replace("_", "-")
        if record_state != "presentation-received":
          return
      except Exception:
        # If we can't fetch the record, fall back to attempting verify (best-effort).
        pass
      LOGGER.info("Auto-verifying presentation %s (verifier demo)", resolved)
      await self.verify_proof(resolved)
    except Exception as exc:  # pylint: disable=broad-except
      LOGGER.warning("Auto-verify failed for %s: %s", pres_ex_id, exc)

  async def _resolve_pres_ex_id(self, candidate: str) -> Optional[str]:
    """Resolve a present-proof v2 exchange id from a webhook payload id.

    Some webhook payloads include a thread id or other identifier rather than the
    `pres_ex_id` used in the admin record URLs. This function attempts to map the
    candidate onto a real `pres_ex_id`.
    """
    if not self._profile:
      return None

    # First: try treating candidate as the actual pres_ex_id, with a short retry window.
    for attempt in range(6):
      record = await self._try_get_present_proof_record(candidate)
      if record:
        return record.get("pres_ex_id") or record.get("presentation_exchange_id") or candidate
      await asyncio.sleep(0.5 * (attempt + 1))

    # Fallback: list recent records and match on thread_id.
    records = await self._list_present_proof_records()
    if not records:
      return None
    for rec in records:
      if rec.get("pres_ex_id") == candidate:
        return candidate
      if rec.get("thread_id") == candidate:
        return rec.get("pres_ex_id")
    return None

  async def _try_get_present_proof_record(self, proof_exchange_id: str) -> Optional[dict]:
    try:
      record = await self.get_proof(proof_exchange_id)
      return record or None
    except HTTPStatusError as err:
      if err.response.status_code == 404:
        return None
      raise

  async def _list_present_proof_records(self) -> list[dict]:
    if not self._profile:
      return []
    async with httpx.AsyncClient() as client:
      resp = await client.get(f"{self.admin_url}/present-proof-2.0/records")
      if resp.status_code == 404:
        return []
      resp.raise_for_status()
      data = resp.json()
      if isinstance(data, dict):
        results = data.get("results") or data.get("result") or data.get("records")
        if isinstance(results, list):
          return results
      if isinstance(data, list):
        return data
    return []

  async def get_connection(self, connection_id: str) -> dict:
    if not self._profile:
      raise RuntimeError("ACA-Py not started")
    async with httpx.AsyncClient() as client:
      resp = await client.get(f"{self.admin_url}/connections/{connection_id}")
      if resp.status_code == 404:
        return {}
      resp.raise_for_status()
      data = resp.json()
      return data.get("result") or data.get("connection") or data

  async def get_oob_record(self, oob_id: str) -> dict:
    if not self._profile:
      raise RuntimeError("ACA-Py not started")
    async with httpx.AsyncClient() as client:
      resp = await client.get(f"{self.admin_url}/out-of-band/records/{oob_id}")
      if resp.status_code == 404:
        return {}
      resp.raise_for_status()
      data = resp.json()
      return data.get("result") or data.get("record") or data

  async def create_did(self, method: str, key_type: str = "ed25519", options: Optional[dict] = None) -> str:
    if not self._profile:
      raise RuntimeError("ACA-Py not started")
    payload_options = dict(options or {})
    if key_type and "key_type" not in payload_options:
      payload_options["key_type"] = key_type
    async with httpx.AsyncClient() as client:
      try:
        resp = await client.post(
          f"{self.admin_url}/wallet/did/create",
          json={"method": method, "options": payload_options},
        )
        resp.raise_for_status()
        data = resp.json()
        return (data.get("result") or {}).get("did")
      except HTTPStatusError as exc:
        if exc.response is not None and exc.response.status_code == 400:
          text = (exc.response.text or "").lower()
          if "did already present" in text:
            existing_did = payload_options.get("did")
            if isinstance(existing_did, str) and existing_did:
              try:
                list_resp = await client.get(f"{self.admin_url}/wallet/did")
                if list_resp.status_code == 200:
                  data = list_resp.json()
                  records = data.get("results") or data.get("result") or data.get("records") or []
                  if isinstance(records, list):
                    for record in records:
                      if record.get("did") == existing_did:
                        LOGGER.info("DID already present; returning existing DID %s", existing_did)
                        return existing_did
              except Exception as list_error:  # pylint: disable=broad-except
                LOGGER.warning(
                  "DID already present; failed to list DIDs (%s). Returning provided DID.",
                  list_error,
                )
              return existing_did
        raise

  async def create_did_key(self, key_type: str = "ed25519") -> str:
    return await self.create_did("key", key_type)

  async def wait_for_proof(self, proof_exchange_id: str, timeout_ms: int = 120000, connection_id: Optional[str] = None) -> dict:
    deadline = time.monotonic() + timeout_ms / 1000
    while time.monotonic() < deadline:
      try:
        record = await self.get_proof(proof_exchange_id, connection_id=connection_id)
      except HTTPStatusError as err:
        if err.response.status_code == 404:
          LOGGER.info("Proof %s not yet available; retrying", proof_exchange_id)
          await asyncio.sleep(1)
          continue
        raise
      state = record.get("state") or record.get("presentation_state") or record.get("verified")
      if state in {"presentation-received", "presentation_received", "done", "abandoned"}:
        return record
      await asyncio.sleep(1)
    raise RuntimeError(f"Proof exchange {proof_exchange_id} did not progress in time")

  async def send_presentation_ack(self, proof_exchange_id: str) -> None:
    if not self._profile:
      raise RuntimeError("ACA-Py not started")
    async with httpx.AsyncClient() as client:
      resp = await client.post(
        f"{self.admin_url}/present-proof-2.0/records/{proof_exchange_id}/send-presentation-ack",
        json={"comment": "CTS auto-ack"},
      )
      # If ACK is not applicable (already acked, wrong state, or record missing), don't crash demo flows.
      if resp.status_code in {400, 404, 409}:
        return
      resp.raise_for_status()

  async def verify_proof(
    self,
    proof_exchange_id: str,
    connection_id: Optional[str] = None,
    enforce_trqp: Optional[bool] = None,
  ) -> dict:
    if not self._profile:
      raise RuntimeError("ACA-Py not started")
    record: dict = {}
    try:
      record = await self.get_proof(proof_exchange_id, connection_id=connection_id)
    except HTTPStatusError as exc:
      if exc.response.status_code != 404:
        raise
    state = (record.get("state") or record.get("presentation_state") or "").replace("_", "-")
    LOGGER.info(
      "verify_proof: proof_exchange_id=%s state=%s connection_id=%s",
      proof_exchange_id,
      state or "unknown",
      connection_id,
    )
    if self._should_enforce_trqp(enforce_trqp) and state == "presentation-received":
      try:
        await self._run_trqp_checks(record)
      except Exception as exc:  # pylint: disable=broad-except
        LOGGER.warning(
          "TRQP enforcement failed for proof_exchange_id=%s: %s",
          proof_exchange_id,
          exc,
        )
        try:
          await self.send_problem_report(proof_exchange_id, "Verification failed by policy")
        except Exception as report_exc:  # pylint: disable=broad-except
          LOGGER.error(
            "Failed to send problem report (proof_exchange_id=%s): %s",
            proof_exchange_id,
            report_exc,
          )
          raise
        # Refresh record after sending problem report (state should move to abandoned).
        try:
          record = await self.get_proof(proof_exchange_id, connection_id=connection_id)
        except Exception:
          record.setdefault("state", "abandoned")
          record.setdefault("verified", False)
        return record
    verified_flag = record.get("verified")
    if verified_flag is not None:
      LOGGER.info(
        "verify_proof: skip verify (verified=%s) proof_exchange_id=%s",
        verified_flag,
        proof_exchange_id,
      )
      return record
    if state and state != "presentation-received":
      LOGGER.info(
        "verify_proof: skip verify (state=%s) proof_exchange_id=%s",
        state,
        proof_exchange_id,
      )
      return record
    async with httpx.AsyncClient() as client:
      try:
        LOGGER.info(
          "verify_proof: POST /present-proof-2.0/records/%s/verify-presentation",
          proof_exchange_id,
        )
        resp = await client.post(
          f"{self.admin_url}/present-proof-2.0/records/{proof_exchange_id}/verify-presentation"
        )
        resp.raise_for_status()
        LOGGER.info(
          "verify_proof: verify response status=%s proof_exchange_id=%s",
          resp.status_code,
          proof_exchange_id,
        )
        # Ensure the prover side reaches 'done' when confirmation is requested.
        try:
          await self.send_presentation_ack(proof_exchange_id)
        except Exception:
          pass
        result = resp.json()
        LOGGER.info(
          "verify_proof: verify response payload=%s",
          json.dumps(result, sort_keys=True, default=str),
        )
        return result
      except Exception:
        raise

  def _should_enforce_trqp(self, enforce_trqp: Optional[bool]) -> bool:
    if not self._profile:
      return False
    label = (self._profile.label or "").upper()
    if "VERIFIER" not in label:
      return False
    if enforce_trqp is not None:
      return enforce_trqp
    return os.getenv("ACAPY_VERIFIER_TRQP_ENFORCE", "false").lower() == "true"

  async def send_problem_report(self, proof_exchange_id: str, description: str) -> None:
    if not self._profile:
      raise RuntimeError("ACA-Py not started")
    if self._should_skip_problem_report(proof_exchange_id):
      LOGGER.info(
        "send_problem_report: skip duplicate (proof_exchange_id=%s)",
        proof_exchange_id,
      )
      return
    payloads = [
      {"description": description},
      {"description": {"en": description}},
    ]
    try:
      async with httpx.AsyncClient() as client:
        last_error: Optional[str] = None
        for payload in payloads:
          resp = await client.post(
            f"{self.admin_url}/present-proof-2.0/records/{proof_exchange_id}/problem-report",
            json=payload,
          )
          if resp.status_code in {200, 201, 202}:
            LOGGER.info(
              "send_problem_report: sent problem report (proof_exchange_id=%s, status=%s)",
              proof_exchange_id,
              resp.status_code,
            )
            return
          last_error = f"{resp.status_code} {resp.text}"
          LOGGER.warning(
            "send_problem_report: failed with payload=%s status=%s",
            payload,
            resp.status_code,
          )
        raise RuntimeError(f"Problem report failed: {last_error}")
    except Exception:
      self._problem_report_cache.pop(proof_exchange_id, None)
      raise

  async def _run_trqp_checks(self, record: dict) -> None:
    vc = self._extract_vc(record)
    if not vc:
      raise RuntimeError("TRQP check failed: no verifiable credential found in presentation")
    authorization_payload, recognition_payload, ecosystem_id = self._build_trqp_payloads(vc)
    trqp_base_url = await self._resolve_trqp_endpoint(ecosystem_id)

    LOGGER.info(
      "TRQP mapping: entity_id=%s authority_id=%s action=%s resource=%s",
      authorization_payload.get("entity_id"),
      authorization_payload.get("authority_id"),
      authorization_payload.get("action"),
      authorization_payload.get("resource"),
    )

    failures: list[str] = []
    async with httpx.AsyncClient() as client:
      LOGGER.info("TRQP authorization check started")
      try:
        auth_resp = await client.post(
          f"{trqp_base_url}/authorization",
          json=authorization_payload,
          headers={"Content-Type": "application/json"},
        )
        auth_payload = await self._read_json_safe(auth_resp)
        if auth_resp.status_code >= 300:
          failures.append(
            f"TRQP authorization failed: {auth_resp.status_code} {auth_resp.reason_phrase} {auth_payload['raw']}"
          )
        elif not self._extract_authorization_result(auth_payload["json"]):
          failures.append("TRQP authorization failed: authorized=false")
        else:
          LOGGER.info("TRQP authorization check passed")
      except Exception as exc:  # pylint: disable=broad-except
        message = str(exc)
        if not message.startswith("TRQP authorization failed:"):
          message = f"TRQP authorization failed: {message}"
        failures.append(message)

      LOGGER.info("TRQP recognition check started")
      try:
        rec_resp = await client.post(
          f"{trqp_base_url}/recognition",
          json=recognition_payload,
          headers={"Content-Type": "application/json"},
        )
        rec_payload = await self._read_json_safe(rec_resp)
        if rec_resp.status_code >= 300:
          failures.append(
            f"TRQP recognition failed: {rec_resp.status_code} {rec_resp.reason_phrase} {rec_payload['raw']}"
          )
        elif not self._extract_recognition_result(rec_payload["json"]):
          failures.append("TRQP recognition failed: recognized=false")
        else:
          LOGGER.info("TRQP recognition check passed")
      except Exception as exc:  # pylint: disable=broad-except
        message = str(exc)
        if not message.startswith("TRQP recognition failed:"):
          message = f"TRQP recognition failed: {message}"
        failures.append(message)

    if failures:
      raise RuntimeError(" | ".join(failures))

  def _build_trqp_payloads(self, vc: dict) -> tuple[dict, dict, str]:
    issuer_did = self._extract_issuer_did(vc)
    subject = self._extract_credential_subject(vc)
    subject_issuer = subject.get("issuer_id") if isinstance(subject, dict) else None
    if isinstance(subject_issuer, str) and subject_issuer and subject_issuer != issuer_did:
      raise RuntimeError(
        f"TRQP mapping failed: credentialSubject.issuer_id ({subject_issuer}) does not match issuer ({issuer_did})"
      )
    ecosystem_id = subject.get("ecosystem_id") if isinstance(subject, dict) else None
    if not isinstance(ecosystem_id, str) or not ecosystem_id:
      raise RuntimeError("TRQP mapping failed: credentialSubject.ecosystem_id missing")
    atn_did = subject.get("ayra_trust_network_did") if isinstance(subject, dict) else None
    if not isinstance(atn_did, str) or not atn_did:
      raise RuntimeError("TRQP mapping failed: credentialSubject.ayra_trust_network_did missing")
    card_type = subject.get("ayra_card_type") if isinstance(subject, dict) else None
    if not isinstance(card_type, str) or not card_type:
      raise RuntimeError("TRQP mapping failed: credentialSubject.ayra_card_type missing")
    issuance_time = self._extract_issuance_time(vc)

    authorization_payload = {
      "entity_id": issuer_did,
      "authority_id": ecosystem_id,
      "action": "issue",
      "resource": f"ayracard:{card_type}",
    }
    recognition_payload: dict[str, Any] = {
      "entity_id": ecosystem_id,
      "authority_id": atn_did,
      "action": "member-of",
      "resource": "ayratrustnetwork",
    }
    if issuance_time:
      recognition_payload["context"] = {"time": issuance_time}
    return authorization_payload, recognition_payload, ecosystem_id

  def _extract_issuer_did(self, vc: dict) -> str:
    issuer = vc.get("issuer")
    if isinstance(issuer, str) and issuer.strip():
      return issuer
    if isinstance(issuer, dict) and isinstance(issuer.get("id"), str) and issuer.get("id").strip():
      return issuer["id"]
    raise RuntimeError("TRQP mapping failed: issuer DID missing from credential")

  def _extract_credential_subject(self, vc: dict) -> dict:
    subject = vc.get("credentialSubject")
    if isinstance(subject, list):
      if not subject:
        raise RuntimeError("TRQP mapping failed: credentialSubject array is empty")
      if isinstance(subject[0], dict):
        return subject[0]
      raise RuntimeError("TRQP mapping failed: credentialSubject array invalid")
    if isinstance(subject, dict):
      return subject
    raise RuntimeError("TRQP mapping failed: credentialSubject missing")

  def _extract_issuance_time(self, vc: dict) -> Optional[str]:
    issuance_date = vc.get("issuanceDate")
    if isinstance(issuance_date, str) and issuance_date:
      return issuance_date
    valid_from = vc.get("validFrom")
    if isinstance(valid_from, str) and valid_from:
      return valid_from
    return None

  async def _resolve_trqp_endpoint(self, ecosystem_did: str) -> str:
    LOGGER.info("Resolving TRQP endpoint from ecosystem DID: %s", ecosystem_did)
    ecosystem_doc = await self._resolve_did_document(ecosystem_did)
    endpoint = self._extract_trqp_service_endpoint(ecosystem_doc)
    if not endpoint:
      raise RuntimeError("TRQP endpoint not found in ecosystem DID document")
    if endpoint.startswith("did:"):
      LOGGER.info("Resolving TRQP endpoint DID: %s", endpoint)
      registry_doc = await self._resolve_did_document(endpoint)
      registry_endpoint = self._extract_trqp_service_endpoint(registry_doc)
      if not registry_endpoint:
        raise RuntimeError("TRQP endpoint DID did not expose a TRQP service endpoint")
      endpoint = registry_endpoint
    normalized = endpoint.rstrip("/")
    LOGGER.info("TRQP endpoint resolved: %s", normalized)
    return normalized

  async def _resolve_did_document(self, did: str) -> dict:
    resolver_url = os.getenv("NEXT_PUBLIC_DID_RESOLVER_URL") or "https://dev.uniresolver.io/1.0/identifiers"
    endpoint = f"{resolver_url.rstrip('/')}/{did}"
    async with httpx.AsyncClient() as client:
      resp = await client.get(endpoint)
      if resp.status_code >= 300:
        raise RuntimeError(
          f"DID resolution failed ({did}): {resp.status_code} {resp.reason_phrase} {resp.text}"
        )
      data = resp.json()
      if isinstance(data, dict) and "didDocument" in data:
        return data.get("didDocument") or {}
      return data

  def _extract_trqp_service_endpoint(self, doc: dict) -> Optional[str]:
    services = doc.get("service")
    if not isinstance(services, list):
      return None
    for service in services:
      types = service.get("type")
      if not isinstance(types, list):
        types = [types]
      matches = False
      for entry in types:
        normalized = str(entry or "").lower()
        if normalized in {"trqp", "trustregistryservice"}:
          matches = True
          break
      if not matches:
        continue
      endpoint = self._extract_service_endpoint_value(service.get("serviceEndpoint"))
      if endpoint:
        return endpoint
    return None

  def _extract_service_endpoint_value(self, endpoint: Any) -> Optional[str]:
    if not endpoint:
      return None
    if isinstance(endpoint, str):
      return endpoint
    if isinstance(endpoint, dict):
      if isinstance(endpoint.get("uri"), str):
        return endpoint.get("uri")
      if isinstance(endpoint.get("url"), str):
        return endpoint.get("url")
    return None

  async def _read_json_safe(self, resp: httpx.Response) -> dict:
    raw = resp.text or ""
    if not raw:
      return {"json": None, "raw": ""}
    try:
      return {"json": resp.json(), "raw": raw}
    except Exception:
      return {"json": None, "raw": raw}

  def _extract_authorization_result(self, payload: Any) -> bool:
    if isinstance(payload, list):
      return any(item.get("authorized") is True for item in payload if isinstance(item, dict))
    if isinstance(payload, dict):
      return payload.get("authorized") is True
    return False

  def _extract_recognition_result(self, payload: Any) -> bool:
    if isinstance(payload, dict):
      return payload.get("recognized") is True
    return False

  def _extract_vc(self, record: dict) -> Optional[dict]:
    def decode_attach(attach: dict) -> Optional[dict]:
      data = attach.get("data") if isinstance(attach, dict) else None
      if not isinstance(data, dict):
        return None
      if "json" in data and isinstance(data.get("json"), dict):
        return data.get("json")
      if "base64" in data and isinstance(data.get("base64"), str):
        try:
          decoded = base64.b64decode(data.get("base64")).decode("utf-8")
          return json.loads(decoded)
        except Exception:
          return None
      return None

    def pick_attaches(obj: Any) -> Optional[list]:
      if not isinstance(obj, dict):
        return None
      for key in ("presentations~attach", "presentations_attach"):
        if isinstance(obj.get(key), list):
          return obj.get(key)
      return None

    candidates = [
      record,
      record.get("record") if isinstance(record, dict) else None,
      record.get("presentation") if isinstance(record, dict) else None,
      record.get("pres") if isinstance(record, dict) else None,
    ]
    for candidate in candidates:
      attaches = pick_attaches(candidate)
      if not attaches:
        continue
      for attach in attaches:
        decoded = decode_attach(attach)
        if not decoded:
          continue
        vp = decoded.get("verifiableCredential") and decoded or decoded.get("vp") or decoded.get("presentation") or decoded
        vc = None
        if isinstance(vp, dict):
          vc = vp.get("verifiableCredential") or vp.get("credential") or vp.get("vc") or vp
        if isinstance(vc, list) and vc:
          vc = vc[0]
        if isinstance(vc, dict):
          return vc
    return None

  async def get_proof(self, proof_exchange_id: str, connection_id: Optional[str] = None) -> dict:
    if not self._profile:
      raise RuntimeError("ACA-Py not started")
    async with httpx.AsyncClient() as client:
      resp = await client.get(
        f"{self.admin_url}/present-proof-2.0/records/{proof_exchange_id}"
      )
      if resp.status_code == 404 and connection_id:
        fallback = await client.get(
          f"{self.admin_url}/present-proof-2.0/records",
          params={"connection_id": connection_id},
        )
        fallback.raise_for_status()
        fallback_payload = fallback.json()
        records = fallback_payload.get("results") or fallback_payload.get("records") or []
        if records:
          records.sort(key=lambda r: r.get("updated_at") or r.get("created_at") or "", reverse=True)
          resolved = records[0]
          fallback_id = resolved.get("pres_ex_id") or resolved.get("presentation_exchange_id") or resolved.get("proof_exchange_id")
          chosen_id = fallback_id or proof_exchange_id
          LOGGER.warning(
            "Proof record %s not found; using latest record %s for connection %s",
            proof_exchange_id,
            chosen_id,
            connection_id,
          )
          resolved.setdefault("proof_exchange_id", chosen_id)
          resolved.setdefault("connection_id", connection_id)
          if chosen_id and chosen_id != proof_exchange_id:
            resp = await client.get(
              f"{self.admin_url}/present-proof-2.0/records/{chosen_id}"
            )
            resp.raise_for_status()
            data = resp.json()
            record = data.get("result") or data.get("record") or data
            record.setdefault("proof_exchange_id", chosen_id)
            return record
          return resolved
      resp.raise_for_status()
      data = resp.json()
      return data.get("result") or data.get("record") or data

  async def _wait_for_admin(self) -> None:
    if not self._profile:
      return

    url = f"{self._profile.admin_url}/status"
    async with httpx.AsyncClient(timeout=2.0) as client:
      for _ in range(40):
        try:
          resp = await client.get(url)
          if resp.status_code == 200:
            LOGGER.info("ACA-Py admin API is ready")
            return
        except httpx.HTTPError:
          await asyncio.sleep(0.5)
      raise RuntimeError("ACA-Py admin API did not become ready in time")

  def _build_presentation_request_payload(self, body: dict) -> dict:
    connection_id = body.get("connection_id")
    if not connection_id:
      raise ValueError("connection_id is required to send a proof request")

    payload: dict = {
      "connection_id": connection_id,
    }
    # Control whether ACA-Py auto-verifies on receipt.
    #
    # In verifier demo mode we prefer to keep the exchange in `presentation-received`
    # so the control service can verify+ACK deterministically (via webhook helper or
    # polling) and avoid races where ACA-Py transitions straight to `done`.
    if "auto_verify" in body and body.get("auto_verify") is not None:
      payload["auto_verify"] = bool(body.get("auto_verify"))
    elif self._profile and "VERIFIER" in (self._profile.label or "").upper():
      payload["auto_verify"] = False
    else:
      payload["auto_verify"] = True
    # Keep proof exchange records around for CTS polling/debugging unless explicitly requested.
    if "auto_remove" in body and body.get("auto_remove") is not None:
      payload["auto_remove"] = bool(body.get("auto_remove"))
    elif self._profile and "VERIFIER" in (self._profile.label or "").upper():
      payload["auto_remove"] = False
    if comment := body.get("comment"):
      payload["comment"] = comment

    presentation_request = body.get("presentation_request")
    if not presentation_request:
      proof_formats = body.get("proof_formats") or {}
      presentation_request = {}
      anoncreds = proof_formats.get("anoncreds") or proof_formats.get("indy")
      if anoncreds:
        presentation_request["indy"] = anoncreds
      dif = proof_formats.get("dif")
      if dif:
        presentation_request["dif"] = dif

    if not presentation_request:
      raise ValueError("presentation_request or proof_formats must be provided")

    payload["presentation_request"] = presentation_request
    return payload
