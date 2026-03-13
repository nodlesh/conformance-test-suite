from __future__ import annotations

from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, Field


class AgentStartRequest(BaseModel):
  profile: Literal["issuer", "verifier", "holder"] = "issuer"
  use_ledger: bool = False


class AgentStartResponse(BaseModel):
  status: Literal["started"]
  profile: str
  admin_url: str


class AgentStopResponse(BaseModel):
  status: Literal["stopped"]


class InvitationResponse(BaseModel):
  invitation_url: str = Field(..., alias="invitation_url")
  connection_id: Optional[str] = None
  out_of_band_id: Optional[str] = None
  oob_id: Optional[str] = None
  invitation: dict


class ProofRequest(BaseModel):
  connection_id: str
  protocol_version: Literal["v2"] = "v2"
  proof_formats: Optional[dict] = None
  presentation_request: Optional[dict] = None
  comment: Optional[str] = None
  auto_verify: Optional[bool] = None
  auto_remove: Optional[bool] = None


class ProofExchangeResponse(BaseModel):
  proof_exchange_id: str
  state: Literal["request-sent", "presentation-received", "done", "abandoned"]
  record: dict
  action: Optional[Literal["verified", "no-op", "waiting", "error"]] = None
  state_before: Optional[str] = None
  state_after: Optional[str] = None
  verified: Optional[bool] = None
  error: Optional[dict] = None

class ProofVerifyRequest(BaseModel):
  proof_exchange_id: str
  timeout_ms: Optional[int] = 120000
  connection_id: Optional[str] = None
  enforce_trqp: Optional[bool] = None


class CredentialOfferRequest(BaseModel):
  connection_id: str
  credential_definition_id: str
  attributes: dict
  protocol_version: Literal["v2"] = "v2"


class CredentialOfferResponse(BaseModel):
  credential_exchange_id: str
  state: str
  record: dict


class WaitForConnectionRequest(BaseModel):
  connection_id: Optional[str] = None
  oob_id: Optional[str] = None
  timeout_ms: Optional[int] = 120000


class ConnectionRecordResponse(BaseModel):
  connection_id: Optional[str] = None
  state: str
  record: dict


class ReceiveInvitationRequest(BaseModel):
  invitation: dict
  auto_accept: Optional[bool] = None
  use_existing_connection: Optional[bool] = None


class ReceiveInvitationResponse(BaseModel):
  connection_id: Optional[str] = None
  oob_id: Optional[str] = None
  record: dict


class CreateDidRequest(BaseModel):
  method: Optional[str] = "key"
  key_type: Literal["ed25519", "bls12381g2"] = "ed25519"
  options: Optional[Dict[str, Any]] = None


class CreateDidResponse(BaseModel):
  did: str
