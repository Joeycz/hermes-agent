# Hermes Desktop Client v1 Plan

## Summary
Build a Codex-like desktop client for Hermes as an `Electron` app with a local Hermes `sidecar` process. The desktop app will be a coding-first workspace UI, not a generic chat shell. v1 will focus on a single repository per window and a single primary thread, with strong support for streaming output, tool activity, dangerous-command approvals, interrupt/retry, and session continuity.

The goal is to reuse Hermes's existing agent/runtime behavior instead of reimplementing it. The desktop app becomes a new interaction surface over Hermes callbacks and session storage.

## Key Changes

### 1. Architecture
- Use `Electron` for the desktop shell.
- Run Hermes as a per-window local child process (`sidecar`), launched by the Electron main process.
- Do not embed the existing TUI from `cli.py`; create a desktop-specific runtime entrypoint that exposes structured events.
- Keep Hermes agent logic in Python: `AIAgent`, tool dispatch, approvals, session DB, interrupt handling, streaming, and persistence remain authoritative.
- Defer multi-window shared runtime, remote agents, and multi-worktree orchestration to later versions.

### 2. Hermes Runtime Surface for Desktop
Add a desktop-facing runtime mode that:
- Accepts commands from the desktop shell over stdin/stdout JSON messages.
- Emits structured events instead of terminal-formatted text.
- Wraps existing Hermes callbacks:
  - `stream_delta_callback` for token streaming
  - `tool_progress_callback` for tool lifecycle events
  - `status_callback` for lifecycle/status notices
  - clarify/approval callbacks for blocking user decisions
- Supports these desktop commands in v1:
  - `session.start`
  - `session.resume`
  - `message.send`
  - `agent.interrupt`
  - `approval.resolve`
  - `clarify.resolve`
  - `session.list`
  - `session.title.set`
  - `config.get`
  - `config.set` for a small safe subset only
- Standardize event types for the desktop:
  - `message.delta`
  - `message.final`
  - `tool.started`
  - `tool.completed`
  - `tool.failed`
  - `approval.requested`
  - `clarify.requested`
  - `agent.interrupted`
  - `session.updated`
  - `error`

### 3. Electron App Shape
Implement three layers:
- Main process:
  - launches/stops Hermes sidecar
  - owns workspace path selection
  - mediates filesystem/OS integrations
  - manages per-window runtime lifecycle
- Preload bridge:
  - exposes a narrow typed IPC API to the renderer
  - no direct Node access in the renderer
- Renderer:
  - coding-first chat UI
  - tool timeline
  - approval modal
  - session sidebar
  - workspace header/status

Use security defaults:
- `contextIsolation: true`
- `sandbox: true` where compatible
- `nodeIntegration: false`
- strict preload API instead of exposing arbitrary shell access

### 4. v1 Product Surface
The first release should include:
- Workspace picker when opening a repo
- Single active session per window, resumable from prior Hermes sessions
- Streaming assistant response pane
- Tool activity rail with live status
- Dangerous command approval modal with approve/deny/session-approve options if Hermes already supports them
- Clarify prompt modal for interactive agent questions
- Stop/retry controls
- Session history sidebar with title and timestamp
- Compact settings panel:
  - model
  - toolsets
  - approvals mode
  - working directory
- Read-only visibility into key runtime state:
  - current model
  - session id
  - active tool call
  - whether the agent is busy

Explicitly out of scope for v1:
- multi-worktree orchestration
- parallel child agent visualization as first-class UI objects
- gateway/platform management UI
- plugin marketplace UI
- remote execution fleet management
- full settings parity with CLI

### 5. Integration Strategy
Prefer a desktop-specific Hermes runtime adapter over scraping CLI output.
- Add a new Python entrypoint for desktop mode.
- Reuse `AIAgent` directly rather than routing through the TUI.
- Reuse `SessionDB` for continuity.
- Reuse existing approval and clarify infrastructure, but surface it as desktop events/responses instead of terminal blocking UI.
- Keep the existing OpenAI-compatible API server untouched in v1; it can become a future alternative transport, not the primary integration.

## Public Interfaces / Types

### Desktop-side transport contract
Define a versioned JSON protocol over stdio.

Host-to-sidecar commands:
```json
{ "type": "message.send", "request_id": "...", "session_id": "...", "text": "..." }
```

Sidecar-to-host events:
```json
{ "type": "tool.started", "session_id": "...", "tool_name": "terminal", "preview": "git status" }
```

Protocol requirements:
- every request has `request_id`
- every async event includes `session_id`
- terminal/UI presentation strings should be additive only; the protocol must also carry structured fields
- sidecar should emit an explicit ready event on startup

### Renderer state model
The renderer should maintain:
- `workspace`
- `sessionList`
- `activeSession`
- `messageTimeline`
- `toolTimeline`
- `pendingApproval`
- `pendingClarify`
- `agentRunState`

## Test Plan
- Hermes desktop runtime:
  - emits correct startup/session/message/tool event sequence
  - streams deltas before final response
  - surfaces approval requests and resumes after user choice
  - surfaces clarify requests and resumes after user answer
  - handles interrupt during model call and during tool execution
  - resumes prior session correctly from `SessionDB`
- Electron main/preload:
  - sidecar lifecycle survives renderer reload
  - malformed sidecar payloads fail closed
  - workspace path is passed correctly and isolated per window
- Renderer:
  - message streaming appends incrementally
  - tool timeline updates in order
  - approval modal blocks the run visually until resolved
  - interrupt/retry controls reflect actual runtime state
- End-to-end:
  - open repo -> send prompt -> receive streamed answer
  - dangerous terminal command -> approval modal -> approve/deny path
  - close/reopen app -> resume session

## Assumptions and Defaults
- `Electron` is the desktop shell for v1.
- Hermes is run as a local child-process sidecar, not via localhost API.
- One window = one workspace = one active primary session.
- The desktop app is coding-first and optimized for local repo workflows.
- Existing Hermes Python runtime remains the source of truth for approvals, sessions, tools, and interruption.
- v1 should avoid editing existing CLI/gateway behavior except where shared runtime abstractions make that necessary.
