# Hermes Desktop Client

This directory contains the first implementation pass for a Codex-like desktop
client for Hermes.

## Structure

- `runtime/` — Python desktop sidecar that wraps `AIAgent` over a JSON-lines
  stdio protocol
- `main.js` / `preload.js` — Electron host process and bridge
- `index.html` / `renderer.js` / `styles.css` — first-pass renderer UI
- `PLAN.md` — agreed implementation plan
- `design.md` — visual and interaction direction derived from the Codex reference

## Local usage

From the repository root:

```bash
cd client
npm install
npm start
```

The Electron host will try these Python executables in order:

1. `HERMES_DESKTOP_PYTHON`
2. `../venv/bin/python`
3. `../venv/bin/python3`
4. `python3`
5. `python`

The sidecar runs `client/runtime/entry.py` and talks to Electron over
newline-delimited JSON on stdio.
