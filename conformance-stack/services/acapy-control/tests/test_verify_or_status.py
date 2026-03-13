from __future__ import annotations

import sys
from pathlib import Path
import unittest

from httpx import HTTPStatusError, Request, Response

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from acapy_controller.rpc import RpcRouter
from acapy_controller.event_bus import EventBroker
from app.schemas.agents import ProofVerifyRequest


class StubManager:
  def __init__(self, record: dict, verify_error: Exception | None = None) -> None:
    self.is_running = True
    self._record = dict(record)
    self._verify_error = verify_error
    self.verify_calls = 0

  async def wait_for_proof(self, proof_exchange_id: str, timeout_ms: int = 2000, connection_id: str | None = None) -> dict:
    return dict(self._record)

  async def get_proof(self, proof_exchange_id: str, connection_id: str | None = None) -> dict:
    return dict(self._record)

  async def verify_proof(
    self,
    proof_exchange_id: str,
    connection_id: str | None = None,
    enforce_trqp: bool | None = None,
  ) -> dict:
    self.verify_calls += 1
    if self._verify_error:
      raise self._verify_error
    self._record["state"] = "done"
    self._record["verified"] = True
    return dict(self._record)


class VerifyOrStatusTests(unittest.IsolatedAsyncioTestCase):
  async def test_presentation_received_is_waiting_without_verify(self):
    manager = StubManager({"proof_exchange_id": "ex-1", "state": "presentation-received"})
    router = RpcRouter(manager, EventBroker())
    body = ProofVerifyRequest(proof_exchange_id="ex-1", timeout_ms=10, connection_id="conn-1")

    response = await router.verify_or_status(body)
    self.assertEqual(manager.verify_calls, 0)
    self.assertEqual(response.action, "waiting")
    self.assertEqual(response.state, "presentation-received")

  async def test_done_does_not_trigger_verify(self):
    manager = StubManager({"proof_exchange_id": "ex-2", "state": "done", "verified": True})
    router = RpcRouter(manager, EventBroker())
    body = ProofVerifyRequest(proof_exchange_id="ex-2", timeout_ms=10, connection_id="conn-2")

    response = await router.verify_or_status(body)
    self.assertEqual(manager.verify_calls, 0)
    self.assertEqual(response.action, "no-op")
    self.assertEqual(response.state, "done")

  async def test_abandoned_returns_error(self):
    manager = StubManager({"proof_exchange_id": "ex-3", "state": "abandoned"})
    router = RpcRouter(manager, EventBroker())
    body = ProofVerifyRequest(proof_exchange_id="ex-3", timeout_ms=10, connection_id="conn-3")

    result = await router.verify_or_status(body)
    self.assertEqual(result.action, "error")
    self.assertEqual(result.error.get("message"), "Proof exchange abandoned")

  async def test_verify_proof_tolerates_done_state_race(self):
    req = Request("POST", "http://acapy/present-proof-2.0/records/ex-4/verify-presentation")
    race_error = HTTPStatusError(
      "400 Presentation exchange ex-4 in done state (must be presentation-received)",
      request=req,
      response=Response(
        400,
        request=req,
        text="Presentation exchange ex-4 in done state (must be presentation-received)",
      ),
    )

    class RaceStubManager(StubManager):
      async def wait_for_proof(
        self,
        proof_exchange_id: str,
        timeout_ms: int = 2000,
        connection_id: str | None = None,
      ) -> dict:
        return {"proof_exchange_id": proof_exchange_id, "state": "presentation-received"}

      async def get_proof(self, proof_exchange_id: str, connection_id: str | None = None) -> dict:
        return {"proof_exchange_id": proof_exchange_id, "state": "done", "verified": True}

    manager = RaceStubManager({"proof_exchange_id": "ex-4"}, verify_error=race_error)
    router = RpcRouter(manager, EventBroker())
    body = ProofVerifyRequest(proof_exchange_id="ex-4", timeout_ms=10, connection_id="conn-4")

    response = await router.verify_proof(body)
    self.assertEqual(manager.verify_calls, 1)
    self.assertEqual(response.state, "done")
    self.assertTrue(response.record.get("verified"))


if __name__ == "__main__":
  unittest.main()
