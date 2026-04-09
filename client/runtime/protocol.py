"""JSON-lines protocol helpers for the Hermes desktop sidecar."""

from __future__ import annotations

import json
import sys
import threading
from typing import Any, Optional


class ProtocolWriter:
    """Thread-safe writer for JSON-line responses and events.

    Protocol frames are always written to ``sys.__stdout__`` so the runtime can
    safely redirect ``sys.stdout`` to stderr while the agent runs.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._stream = sys.__stdout__

    def _write(self, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload, ensure_ascii=False)
        with self._lock:
            self._stream.write(encoded + "\n")
            self._stream.flush()

    def event(self, event_type: str, payload: Optional[dict[str, Any]] = None) -> None:
        self._write({
            "event": True,
            "type": event_type,
            "payload": payload or {},
        })

    def response(
        self,
        request_id: str,
        *,
        ok: bool,
        data: Optional[dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> None:
        payload: dict[str, Any] = {
            "response": True,
            "request_id": request_id,
            "ok": ok,
        }
        if ok:
            payload["data"] = data or {}
        else:
            payload["error"] = error or "Unknown error"
        self._write(payload)


def parse_request(line: str) -> dict[str, Any]:
    """Parse a single JSON-lines request frame."""
    payload = json.loads(line)
    if not isinstance(payload, dict):
        raise ValueError("Protocol frame must be a JSON object")
    if not payload.get("request_id"):
        raise ValueError("Protocol frame is missing request_id")
    if not payload.get("type"):
        raise ValueError("Protocol frame is missing type")
    raw_payload = payload.get("payload")
    if raw_payload is None:
        payload["payload"] = {}
    elif not isinstance(raw_payload, dict):
        raise ValueError("Protocol frame payload must be an object")
    return payload
