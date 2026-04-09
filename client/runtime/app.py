"""Desktop sidecar runtime for the Hermes Electron client."""

from __future__ import annotations

import contextlib
import json
import logging
import os
import queue
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from hermes_cli.config import load_config
from hermes_state import SessionDB
from run_agent import AIAgent
from tools.approval import reset_current_session_key, set_current_session_key
from tools.terminal_tool import (
    clear_task_env_overrides,
    register_task_env_overrides,
    set_approval_callback,
)

from .config_store import load_snapshot, save_value
from .protocol import ProtocolWriter

logger = logging.getLogger(__name__)


@dataclass
class PendingPrompt:
    """One blocking desktop prompt waiting for a user response."""

    prompt_id: str
    response_queue: "queue.Queue[str]"
    kind: str
    payload: dict[str, Any]


@dataclass
class DesktopSession:
    """In-memory desktop session state."""

    session_id: str
    cwd: str
    model: str
    toolsets: list[str]
    history: list[dict[str, Any]] = field(default_factory=list)
    agent: Optional[AIAgent] = None
    busy: bool = False
    run_thread: Optional[threading.Thread] = None
    pending_approval: Optional[PendingPrompt] = None
    pending_clarify: Optional[PendingPrompt] = None


class DesktopRuntime:
    """Structured stdio runtime for the Hermes desktop client."""

    def __init__(self) -> None:
        self.writer = ProtocolWriter()
        self.db = SessionDB()
        self._sessions: dict[str, DesktopSession] = {}
        self._lock = threading.Lock()
        set_approval_callback(self._approval_callback)

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    def run(self) -> None:
        self.writer.event("ready", {
            "pid": os.getpid(),
            "config": load_snapshot(),
        })
        for raw_line in sys.stdin:
            line = raw_line.strip()
            if not line:
                continue
            try:
                request = json.loads(line)
                if not isinstance(request, dict):
                    raise ValueError("Request must be a JSON object")
                request_id = str(request.get("request_id") or "")
                command_type = str(request.get("type") or "")
                payload = request.get("payload") or {}
                if not request_id or not command_type or not isinstance(payload, dict):
                    raise ValueError("Malformed request")
                data = self.dispatch(command_type, payload)
                self.writer.response(request_id, ok=True, data=data)
            except Exception as exc:
                logger.exception("Desktop runtime request failed")
                request_id = ""
                try:
                    request_id = str(request.get("request_id") or "")
                except Exception:
                    pass
                if request_id:
                    self.writer.response(request_id, ok=False, error=str(exc))
                else:
                    self.writer.event("error", {"message": str(exc)})

    # ------------------------------------------------------------------
    # Commands
    # ------------------------------------------------------------------

    def dispatch(self, command_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        handlers = {
            "session.start": self._handle_session_start,
            "session.resume": self._handle_session_resume,
            "session.list": self._handle_session_list,
            "session.title.set": self._handle_session_title_set,
            "message.send": self._handle_message_send,
            "agent.interrupt": self._handle_agent_interrupt,
            "approval.resolve": self._handle_approval_resolve,
            "clarify.resolve": self._handle_clarify_resolve,
            "config.get": self._handle_config_get,
            "config.set": self._handle_config_set,
        }
        handler = handlers.get(command_type)
        if handler is None:
            raise ValueError(f"Unknown command type: {command_type}")
        return handler(payload)

    def _handle_session_start(self, payload: dict[str, Any]) -> dict[str, Any]:
        config = load_snapshot()
        session_id = str(payload.get("session_id") or str(uuid.uuid4()))
        cwd = os.path.abspath(str(payload.get("cwd") or config["cwd"] or os.getcwd()))
        model = str(payload.get("model") or config["model"] or "")
        toolsets = _normalize_toolsets(payload.get("toolsets"), config["toolsets"])

        self.db.create_session(
            session_id=session_id,
            source="desktop",
            model=model or None,
            model_config={"cwd": cwd, "toolsets": toolsets},
        )
        session = DesktopSession(
            session_id=session_id,
            cwd=cwd,
            model=model,
            toolsets=toolsets,
        )
        session.agent = self._make_agent(session)
        with self._lock:
            self._sessions[session_id] = session

        snapshot = self._session_snapshot(session)
        self.writer.event("session.updated", snapshot)
        return snapshot

    def _handle_session_resume(self, payload: dict[str, Any]) -> dict[str, Any]:
        session_id = str(payload.get("session_id") or "").strip()
        if not session_id:
            raise ValueError("session_id is required")

        with self._lock:
            existing = self._sessions.get(session_id)
        if existing is not None:
            snapshot = self._session_snapshot(existing)
            self.writer.event("session.updated", snapshot)
            return snapshot

        row = self.db.get_session(session_id)
        if not row:
            raise ValueError(f"Session not found: {session_id}")

        config = load_snapshot()
        meta = {}
        raw_meta = row.get("model_config")
        if raw_meta:
            try:
                meta = json.loads(raw_meta)
            except (json.JSONDecodeError, TypeError):
                meta = {}

        cwd = os.path.abspath(str(payload.get("cwd") or meta.get("cwd") or config["cwd"] or os.getcwd()))
        model = str(payload.get("model") or row.get("model") or config["model"] or "")
        toolsets = _normalize_toolsets(payload.get("toolsets"), meta.get("toolsets") or config["toolsets"])
        history = self.db.get_messages_as_conversation(session_id)
        self.db.reopen_session(session_id)

        session = DesktopSession(
            session_id=session_id,
            cwd=cwd,
            model=model,
            toolsets=toolsets,
            history=history,
        )
        session.agent = self._make_agent(session)
        with self._lock:
            self._sessions[session_id] = session

        snapshot = self._session_snapshot(session)
        self.writer.event("session.updated", snapshot)
        return snapshot

    def _handle_session_list(self, payload: dict[str, Any]) -> dict[str, Any]:
        rows = self.db.list_sessions_rich(source="desktop", limit=int(payload.get("limit") or 50))
        sessions = []
        for row in rows:
            meta = {}
            if row.get("model_config"):
                try:
                    meta = json.loads(row["model_config"])
                except (json.JSONDecodeError, TypeError):
                    meta = {}
            with self._lock:
                live = self._sessions.get(row["id"])
            sessions.append({
                "session_id": row["id"],
                "title": row.get("title"),
                "model": row.get("model") or "",
                "cwd": meta.get("cwd") or ".",
                "toolsets": list(meta.get("toolsets") or []),
                "message_count": row.get("message_count") or 0,
                "preview": row.get("preview") or "",
                "started_at": row.get("started_at"),
                "last_active": row.get("last_active"),
                "busy": bool(live.busy) if live else False,
            })
        return {"sessions": sessions}

    def _handle_session_title_set(self, payload: dict[str, Any]) -> dict[str, Any]:
        session_id = str(payload.get("session_id") or "").strip()
        title = str(payload.get("title") or "")
        if not session_id:
            raise ValueError("session_id is required")
        self.db.set_session_title(session_id, title)
        with self._lock:
            session = self._sessions.get(session_id)
        snapshot = self._session_snapshot(session) if session else {
            "session_id": session_id,
            "title": self.db.get_session_title(session_id),
        }
        self.writer.event("session.updated", snapshot)
        return snapshot

    def _handle_message_send(self, payload: dict[str, Any]) -> dict[str, Any]:
        session = self._require_session(payload)
        text = str(payload.get("text") or "").strip()
        if not text:
            raise ValueError("text is required")
        if session.busy:
            raise ValueError("Session is already running")

        session.busy = True
        snapshot = self._session_snapshot(session)
        self.writer.event("session.updated", snapshot)

        run_thread = threading.Thread(
            target=self._run_agent_turn,
            name=f"desktop-session-{session.session_id}",
            args=(session, text),
            daemon=True,
        )
        session.run_thread = run_thread
        run_thread.start()
        return snapshot

    def _handle_agent_interrupt(self, payload: dict[str, Any]) -> dict[str, Any]:
        session = self._require_session(payload)
        if session.agent:
            session.agent.interrupt()
        if session.pending_approval:
            session.pending_approval.response_queue.put("deny")
        if session.pending_clarify:
            session.pending_clarify.response_queue.put("")
        return {"session_id": session.session_id, "busy": session.busy}

    def _handle_approval_resolve(self, payload: dict[str, Any]) -> dict[str, Any]:
        session = self._require_session(payload)
        prompt = session.pending_approval
        if prompt is None:
            raise ValueError("No pending approval")
        prompt_id = str(payload.get("prompt_id") or "")
        choice = str(payload.get("choice") or "").strip().lower()
        if prompt_id and prompt_id != prompt.prompt_id:
            raise ValueError("Approval prompt id mismatch")
        if choice not in {"once", "session", "always", "deny"}:
            raise ValueError("Invalid approval choice")
        prompt.response_queue.put(choice)
        return {"session_id": session.session_id, "prompt_id": prompt.prompt_id}

    def _handle_clarify_resolve(self, payload: dict[str, Any]) -> dict[str, Any]:
        session = self._require_session(payload)
        prompt = session.pending_clarify
        if prompt is None:
            raise ValueError("No pending clarify prompt")
        prompt_id = str(payload.get("prompt_id") or "")
        if prompt_id and prompt_id != prompt.prompt_id:
            raise ValueError("Clarify prompt id mismatch")
        answer = str(payload.get("answer") or "")
        prompt.response_queue.put(answer)
        return {"session_id": session.session_id, "prompt_id": prompt.prompt_id}

    def _handle_config_get(self, payload: dict[str, Any]) -> dict[str, Any]:
        return {"config": load_snapshot()}

    def _handle_config_set(self, payload: dict[str, Any]) -> dict[str, Any]:
        key = str(payload.get("key") or "").strip()
        if not key:
            raise ValueError("key is required")
        config = save_value(key, payload.get("value"))
        self.writer.event("config.updated", {"config": config})
        return {"config": config}

    # ------------------------------------------------------------------
    # Agent execution
    # ------------------------------------------------------------------

    def _make_agent(self, session: DesktopSession) -> AIAgent:
        register_task_env_overrides(session.session_id, {"cwd": session.cwd})
        return AIAgent(
            model=session.model,
            enabled_toolsets=session.toolsets or None,
            quiet_mode=True,
            platform="desktop",
            session_id=session.session_id,
            session_db=self.db,
            persist_session=True,
            tool_progress_callback=lambda *args, **kwargs: self._on_tool_progress(session, *args, **kwargs),
            stream_delta_callback=lambda delta: self._on_stream_delta(session, delta),
            status_callback=lambda kind, message: self._on_status(session, kind, message),
            clarify_callback=lambda question, choices=None: self._clarify_callback(session, question, choices),
        )

    def _run_agent_turn(self, session: DesktopSession, text: str) -> None:
        approval_token = set_current_session_key(session.session_id)
        try:
            with contextlib.redirect_stdout(sys.stderr):
                if session.agent is None:
                    session.agent = self._make_agent(session)
                result = session.agent.run_conversation(
                    text,
                    conversation_history=list(session.history),
                )
            session.history = result.get("messages") or session.history
            session.model = result.get("model") or session.model
            self.writer.event("message.final", {
                "session_id": session.session_id,
                "text": result.get("final_response") or "",
                "interrupted": bool(result.get("interrupted")),
                "completed": bool(result.get("completed")),
                "model": session.model,
                "messages": _serialize_history(session.history),
            })
        except Exception as exc:
            logger.exception("Desktop session run failed")
            self.writer.event("error", {
                "session_id": session.session_id,
                "message": str(exc),
            })
        finally:
            session.busy = False
            session.run_thread = None
            session.pending_approval = None
            session.pending_clarify = None
            self.writer.event("session.updated", self._session_snapshot(session))
            reset_current_session_key(approval_token)

    # ------------------------------------------------------------------
    # Event callbacks
    # ------------------------------------------------------------------

    def _on_stream_delta(self, session: DesktopSession, delta: Optional[str]) -> None:
        if delta is None:
            return
        self.writer.event("message.delta", {
            "session_id": session.session_id,
            "delta": delta,
        })

    def _on_tool_progress(
        self,
        session: DesktopSession,
        event_type: str,
        tool_name: str,
        preview: Optional[str],
        args: Optional[dict[str, Any]],
        **kwargs: Any,
    ) -> None:
        payload = {
            "session_id": session.session_id,
            "tool_name": tool_name,
            "preview": preview,
            "args": args,
        }
        payload.update(kwargs)
        self.writer.event(event_type, payload)

    def _on_status(self, session: DesktopSession, kind: str, message: str) -> None:
        self.writer.event("status.updated", {
            "session_id": session.session_id,
            "kind": kind,
            "message": message,
        })

    def _approval_callback(self, command: str, description: str) -> str:
        session = self._current_busy_session()
        if session is None:
            return "deny"

        prompt = PendingPrompt(
            prompt_id=str(uuid.uuid4()),
            response_queue=queue.Queue(),
            kind="approval",
            payload={
                "command": command,
                "description": description,
                "choices": ["once", "session", "always", "deny"],
            },
        )
        session.pending_approval = prompt
        self.writer.event("approval.requested", {
            "session_id": session.session_id,
            "prompt_id": prompt.prompt_id,
            **prompt.payload,
        })

        while True:
            try:
                result = prompt.response_queue.get(timeout=0.25)
                session.pending_approval = None
                return result
            except queue.Empty:
                if session.agent and session.agent.is_interrupted():
                    session.pending_approval = None
                    return "deny"

    def _clarify_callback(self, session: DesktopSession, question: str, choices=None) -> str:
        prompt = PendingPrompt(
            prompt_id=str(uuid.uuid4()),
            response_queue=queue.Queue(),
            kind="clarify",
            payload={
                "question": question,
                "choices": list(choices or []),
            },
        )
        session.pending_clarify = prompt
        self.writer.event("clarify.requested", {
            "session_id": session.session_id,
            "prompt_id": prompt.prompt_id,
            **prompt.payload,
        })
        while True:
            try:
                result = prompt.response_queue.get(timeout=0.25)
                session.pending_clarify = None
                return result
            except queue.Empty:
                if session.agent and session.agent.is_interrupted():
                    session.pending_clarify = None
                    return ""

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _require_session(self, payload: dict[str, Any]) -> DesktopSession:
        session_id = str(payload.get("session_id") or "").strip()
        if not session_id:
            raise ValueError("session_id is required")
        with self._lock:
            session = self._sessions.get(session_id)
        if session is None:
            raise ValueError(f"Session not loaded: {session_id}")
        return session

    def _current_busy_session(self) -> Optional[DesktopSession]:
        with self._lock:
            for session in self._sessions.values():
                if session.busy:
                    return session
        return None

    def _session_snapshot(self, session: DesktopSession) -> dict[str, Any]:
        title = self.db.get_session_title(session.session_id)
        return {
            "session_id": session.session_id,
            "title": title,
            "cwd": session.cwd,
            "model": session.model,
            "toolsets": session.toolsets,
            "busy": session.busy,
            "messages": _serialize_history(session.history),
        }


def _normalize_toolsets(raw_value: Any, default: list[str]) -> list[str]:
    if isinstance(raw_value, list) and all(isinstance(item, str) for item in raw_value):
        return raw_value
    if isinstance(raw_value, str) and raw_value.strip():
        return [item.strip() for item in raw_value.split(",") if item.strip()]
    return list(default or [])


def _serialize_history(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = []
    for msg in messages:
        role = msg.get("role")
        if role not in {"system", "user", "assistant", "tool"}:
            continue
        result.append({
            "role": role,
            "content": msg.get("content"),
            "tool_name": msg.get("tool_name"),
            "tool_call_id": msg.get("tool_call_id"),
        })
    return result
