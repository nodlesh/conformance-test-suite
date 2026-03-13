from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Dict, List, Set


class EventBroker:
  """In-memory pub/sub broker for SSE-style streaming."""

  def __init__(self) -> None:
    self._subscribers: Set[asyncio.Queue] = set()
    self._lock = asyncio.Lock()

  async def subscribe(self) -> asyncio.Queue:
    queue: asyncio.Queue = asyncio.Queue()
    async with self._lock:
      self._subscribers.add(queue)
    return queue

  async def unsubscribe(self, queue: asyncio.Queue) -> None:
    async with self._lock:
      self._subscribers.discard(queue)

  async def publish(self, event_type: str, payload: Dict[str, Any]) -> None:
    envelope = {
      "type": event_type,
      "payload": payload,
      "timestamp": time.time(),
    }
    async with self._lock:
      subscribers: List[asyncio.Queue] = list(self._subscribers)
    for queue in subscribers:
      await queue.put(envelope)
