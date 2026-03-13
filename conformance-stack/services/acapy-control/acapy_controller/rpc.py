from __future__ import annotations

import os
import json
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException
from httpx import HTTPStatusError
from fastapi.responses import StreamingResponse

from acapy_controller.process_manager import AcaPyProcessManager
from acapy_controller.event_bus import EventBroker
from app.schemas.agents import (
  AgentStartRequest,
  AgentStartResponse,
  AgentStopResponse,
  CredentialOfferRequest,
  CredentialOfferResponse,
  InvitationResponse,
  ConnectionRecordResponse,
  ProofExchangeResponse,
  ProofRequest,
  ProofVerifyRequest,
  WaitForConnectionRequest,
  CreateDidRequest,
  CreateDidResponse,
  ReceiveInvitationRequest,
  ReceiveInvitationResponse,
)

LOGGER = logging.getLogger(__name__)


class RpcRouter:
  def __init__(self, manager: AcaPyProcessManager, events: EventBroker) -> None:
    self.manager = manager
    self.events = events
    self.router = APIRouter()
    self._register_routes()

  def _register_routes(self) -> None:
    self.router.post("/agent/start", response_model=AgentStartResponse)(self.start_agent)
    self.router.post("/agent/stop", response_model=AgentStopResponse)(self.stop_agent)
    self.router.post("/connections/create-invitation", response_model=InvitationResponse)(self.create_invitation)
    self.router.post("/connections/receive-invitation", response_model=ReceiveInvitationResponse)(self.receive_invitation)
    self.router.post("/proofs/request", response_model=ProofExchangeResponse)(self.request_proof)
    self.router.post("/proofs/verify", response_model=ProofExchangeResponse)(self.verify_proof)
    self.router.post("/proofs/verify-or-status", response_model=ProofExchangeResponse)(self.verify_or_status)
    self.router.post("/credentials/offer", response_model=CredentialOfferResponse)(self.offer_credential)
    self.router.get("/events/stream")(self.stream_events)
    self.router.post("/connections/wait", response_model=ConnectionRecordResponse)(self.wait_for_connection)
    self.router.post("/wallet/did/create", response_model=CreateDidResponse)(self.create_did)

  async def start_agent(self, body: AgentStartRequest):
    try:
      profile_path = Path(__file__).resolve().parent.parent / "profiles" / f"{body.profile}.yaml"
      profile = await self.manager.start(profile_path)
      public_admin_host = os.getenv("ACAPY_ADMIN_HOST") or os.getenv("ACAPY_PUBLIC_ADMIN_HOST")
      admin_url = (
        f"http://{public_admin_host}:{profile.admin_port}"
        if public_admin_host
        else profile.admin_url
      )
      response = AgentStartResponse(status="started", profile=body.profile, admin_url=admin_url)
      await self.events.publish("agent_started", response.dict())
      return response
    except Exception as exc:  # pylint: disable=broad-except
      raise HTTPException(status_code=500, detail=str(exc)) from exc

  async def stop_agent(self):
    await self.manager.stop()
    response = AgentStopResponse(status="stopped")
    await self.events.publish("agent_stopped", response.dict())
    return response

  async def create_invitation(self):
    if not self.manager.is_running:
      raise HTTPException(status_code=400, detail="Agent not started")

    payload = await self.manager.create_invitation()
    response = InvitationResponse(
      invitation_url=payload["invitation_url"],
      connection_id=payload["connection_id"],
      out_of_band_id=payload.get("out_of_band_id") or payload.get("oob_id"),
      oob_id=payload.get("oob_id") or payload.get("out_of_band_id"),
      invitation=payload["invitation"],
    )
    await self.events.publish("invitation_created", response.dict(by_alias=True))
    return response

  async def request_proof(self, body: ProofRequest):
    if not self.manager.is_running:
      raise HTTPException(status_code=400, detail="Agent not started")

    response = await self.manager.request_proof(body.dict())
    response = ProofExchangeResponse(
      proof_exchange_id=response["proof_exchange_id"],
      state=response["state"],
      record=response,
    )
    await self.events.publish("proof_request", response.dict())
    return response

  async def offer_credential(self, body: CredentialOfferRequest):
    if not self.manager.is_running:
      raise HTTPException(status_code=400, detail="Agent not started")

    payload = await self.manager.offer_credential(body.dict())
    response = CredentialOfferResponse(
      credential_exchange_id=payload["cred_ex_record"]["cred_ex_id"],
      state=payload["cred_ex_record"]["state"],
      record=payload["cred_ex_record"],
    )
    await self.events.publish("credential_offer", response.dict())
    return response

  async def verify_proof(self, body: ProofVerifyRequest):
    if not self.manager.is_running:
      raise HTTPException(status_code=400, detail="Agent not started")
    initial_record = await self.manager.wait_for_proof(
      body.proof_exchange_id,
      body.timeout_ms or 120000,
      body.connection_id,
    )
    resolved_id = initial_record.get("proof_exchange_id", body.proof_exchange_id)
    record = dict(initial_record)
    state = (record.get("state") or record.get("presentation_state") or "").replace("_", "-")
    if state == "presentation-received":
      LOGGER.info(
        "ACA-Py verify request: endpoint=/present-proof-2.0/records/%s/verify-presentation connection_id=%s",
        resolved_id,
        body.connection_id,
      )
      try:
        await self.manager.verify_proof(resolved_id, body.connection_id, enforce_trqp=body.enforce_trqp)
      except HTTPStatusError as exc:
        error_text = (exc.response.text or "").lower()
        is_verify_race = exc.response.status_code == 400 and (
          "in done state" in error_text or "must be presentation-received" in error_text
        )
        if is_verify_race:
          LOGGER.warning(
            "ACA-Py verify race detected; record already transitioned before verify call "
            "(proof_exchange_id=%s, status=%s, body=%s). Treating as no-op.",
            resolved_id,
            exc.response.status_code,
            exc.response.text,
          )
        else:
          LOGGER.error(
            "ACA-Py verify failed (proof_exchange_id=%s, status=%s, body=%s)",
            resolved_id,
            exc.response.status_code,
            exc.response.text,
          )
          raise
      except Exception as exc:
        LOGGER.error(
          "ACA-Py verify failed (proof_exchange_id=%s, error=%s)",
          resolved_id,
          exc,
        )
        raise
      try:
        record = await self.manager.get_proof(resolved_id, connection_id=body.connection_id)
      except HTTPStatusError as exc:
        if exc.response.status_code != 404:
          raise
        record["state"] = record.get("state") or record.get("presentation_state") or "done"
        record["presentation_state"] = "done"
        record["verified"] = record.get("verified") or "true"
        record["proof_exchange_id"] = resolved_id
      verified_flag = record.get("verified")
      LOGGER.info(
        "ACA-Py verify response: proof_exchange_id=%s state=%s verified=%s",
        resolved_id,
        record.get("state") or record.get("presentation_state"),
        verified_flag,
      )
    response = ProofExchangeResponse(
      proof_exchange_id=record.get("proof_exchange_id", resolved_id),
      state=record.get("state") or record.get("presentation_state") or "unknown",
      record=record,
    )
    await self.events.publish("proof_verified", response.dict())
    return response

  async def verify_or_status(self, body: ProofVerifyRequest):
    """Polling-friendly variant of verify_proof.

    - Returns the latest record/state only; verification is triggered via /proofs/verify.
    - If already done, return a no-op status.
    - If abandoned, return an error payload.
    """
    if not self.manager.is_running:
      raise HTTPException(status_code=400, detail="Agent not started")

    record: dict = {}
    action = "waiting"
    error_payload: dict | None = None
    state_before: str | None = None
    state_after: str | None = None
    try:
      record = await self.manager.wait_for_proof(
        body.proof_exchange_id,
        body.timeout_ms or 2000,
        body.connection_id,
      )
    except Exception as exc:
      try:
        record = await self.manager.get_proof(body.proof_exchange_id, connection_id=body.connection_id)
      except Exception as fetch_exc:
        LOGGER.warning(
          "ACA-Py verify-or-status: unable to load proof record (proof_exchange_id=%s, error=%s)",
          body.proof_exchange_id,
          fetch_exc,
        )
        record = {"proof_exchange_id": body.proof_exchange_id}

    resolved_id = record.get("proof_exchange_id", body.proof_exchange_id)
    state_raw = record.get("state") or record.get("presentation_state") or ""
    state_before = state_raw.replace("_", "-").lower() if state_raw else None
    LOGGER.info(
      "ACA-Py verify-or-status: state_before=%s proof_exchange_id=%s connection_id=%s",
      state_before,
      resolved_id,
      body.connection_id,
    )
    if state_before == "presentation-received":
      LOGGER.info(
        "ACA-Py verify-or-status: state presentation-received; status only (proof_exchange_id=%s)",
        resolved_id,
      )
      action = "waiting"
    elif state_before == "done":
      LOGGER.info(
        "ACA-Py verify-or-status: state already done; no-op (proof_exchange_id=%s)",
        resolved_id,
      )
      action = "no-op"
    elif state_before == "abandoned":
      LOGGER.info(
        "ACA-Py verify-or-status: state abandoned (proof_exchange_id=%s)",
        resolved_id,
      )
      action = "error"
      error_payload = {
        "message": "Proof exchange abandoned",
        "state": state_before,
      }
    else:
      LOGGER.info(
        "ACA-Py verify-or-status: waiting (proof_exchange_id=%s, state_before=%s)",
        resolved_id,
        state_before,
      )
      action = "waiting"

    state_after_raw = record.get("state") or record.get("presentation_state") or state_before or "request-sent"
    state_after = state_after_raw.replace("_", "-").lower() if state_after_raw else None
    # Normalize state to the limited set the schema allows
    normalized_state = state_after or state_before or "request-sent"
    if normalized_state not in {"request-sent", "presentation-received", "done", "abandoned"}:
      normalized_state = "request-sent"
    verified_raw = record.get("verified")
    verified_flag = True if verified_raw in (True, "true") else False if verified_raw in (False, "false") else None
    response = ProofExchangeResponse(
      proof_exchange_id=record.get("proof_exchange_id", resolved_id),
      state=normalized_state,  # type: ignore[arg-type]
      record=record,
      action=action,
      state_before=state_before,
      state_after=state_after,
      verified=verified_flag,
      error=error_payload,
    )
    LOGGER.info(
      "ACA-Py verify-or-status: proof_exchange_id=%s action=%s state_before=%s state_after=%s verified=%s",
      response.proof_exchange_id,
      action,
      state_before,
      state_after,
      verified_flag,
    )
    await self.events.publish("proof_verified", response.dict())
    return response

  async def wait_for_connection(self, body: WaitForConnectionRequest):
    if not self.manager.is_running:
      raise HTTPException(status_code=400, detail="Agent not started")
    try:
      record = {}
      if body.oob_id:
        record = await self.manager.wait_for_oob_connection(body.oob_id, body.timeout_ms or 120000)
      if (not record) and body.connection_id:
        record = await self.manager.wait_for_connection(body.connection_id, body.timeout_ms or 120000)
      if not record:
        raise HTTPException(status_code=504, detail="Timed out waiting for connection")
      response = ConnectionRecordResponse(
        connection_id=record.get("connection_id", body.connection_id),
        state=record.get("state") or record.get("rfc23_state") or "unknown",
        record=record,
      )
      await self.events.publish("connection_ready", response.dict())
      return response
    except HTTPException:
      raise
    except Exception as exc:  # pylint: disable=broad-except
      raise HTTPException(status_code=504, detail=str(exc)) from exc

  async def create_did(self, body: CreateDidRequest):
    if not self.manager.is_running:
      raise HTTPException(status_code=400, detail="Agent not started")
    method = (body.method or "key").strip()
    did = await self.manager.create_did(method, body.key_type, body.options)
    return CreateDidResponse(did=did)

  async def receive_invitation(self, body: ReceiveInvitationRequest):
    if not self.manager.is_running:
      # Auto-start the holder/target agent using configured profile
      profile_name = os.getenv("ACAPY_PROFILE") or "holder"
      try:
        profile_path = Path(__file__).resolve().parent.parent / "profiles" / f"{profile_name}.yaml"
        await self.manager.start(profile_path)
      except Exception as exc:  # pylint: disable=broad-except
        raise HTTPException(status_code=500, detail=f"Failed to start agent: {exc}") from exc
    try:
      record = await self.manager.receive_invitation(
        body.invitation,
        auto_accept=body.auto_accept,
        use_existing_connection=body.use_existing_connection,
      )
      return ReceiveInvitationResponse(
        connection_id=record.get("connection_id"),
        oob_id=record.get("oob_id") or record.get("out_of_band_id"),
        record=record,
      )
    except Exception as exc:  # pylint: disable=broad-except
      raise HTTPException(status_code=500, detail=str(exc)) from exc

  async def stream_events(self):
    queue = await self.events.subscribe()

    async def event_generator():
      try:
        while True:
          event = await queue.get()
          yield f"data: {json.dumps(event)}\n\n"
      finally:
        await self.events.unsubscribe(queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
