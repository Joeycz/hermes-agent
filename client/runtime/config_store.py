"""Safe config helpers for the Hermes desktop runtime."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from hermes_cli.config import ensure_hermes_home, get_config_path, load_config
from utils import atomic_yaml_write

_ALLOWED_KEYS = {"model", "toolsets", "approvals_mode", "cwd"}
_ALLOWED_APPROVAL_MODES = {"manual", "smart", "off"}


def load_snapshot() -> dict[str, Any]:
    """Return the small desktop-facing config subset."""
    config = load_config()
    model_block = config.get("model", "")
    if isinstance(model_block, dict):
        model_value = str(model_block.get("default") or "").strip()
    else:
        model_value = str(model_block or "").strip()
    return {
        "model": model_value,
        "toolsets": list(config.get("toolsets") or []),
        "approvals_mode": ((config.get("approvals") or {}).get("mode") or "manual"),
        "cwd": ((config.get("terminal") or {}).get("cwd") or "."),
        "config_path": str(get_config_path()),
    }


def save_value(key: str, value: Any) -> dict[str, Any]:
    """Persist one supported config value and return the updated snapshot."""
    if key not in _ALLOWED_KEYS:
        raise ValueError(f"Unsupported config key: {key}")

    ensure_hermes_home()
    config_path = get_config_path()
    raw = _read_raw_config(config_path)

    if key == "model":
        existing = raw.get("model")
        if isinstance(existing, dict):
            existing["default"] = str(value or "").strip()
            raw["model"] = existing
        else:
            raw["model"] = str(value or "").strip()
    elif key == "toolsets":
        if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
            raise ValueError("toolsets must be a list of strings")
        raw["toolsets"] = value
    elif key == "approvals_mode":
        normalized = str(value or "").strip().lower()
        if normalized not in _ALLOWED_APPROVAL_MODES:
            raise ValueError("approvals_mode must be one of: manual, smart, off")
        raw.setdefault("approvals", {})
        raw["approvals"]["mode"] = normalized
    elif key == "cwd":
        raw.setdefault("terminal", {})
        raw["terminal"]["cwd"] = str(value or ".").strip() or "."

    atomic_yaml_write(config_path, raw)
    return load_snapshot()


def _read_raw_config(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}
