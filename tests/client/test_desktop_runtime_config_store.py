from pathlib import Path

import yaml

from client.runtime.config_store import load_snapshot, save_value


def test_save_value_persists_desktop_subset(tmp_path, monkeypatch):
    hermes_home = tmp_path / ".hermes"
    hermes_home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(hermes_home))

    snapshot = save_value("model", "openai/gpt-5")
    assert snapshot["model"] == "openai/gpt-5"

    snapshot = save_value("toolsets", ["hermes-cli", "browser"])
    assert snapshot["toolsets"] == ["hermes-cli", "browser"]

    snapshot = save_value("approvals_mode", "off")
    assert snapshot["approvals_mode"] == "off"

    snapshot = save_value("cwd", "/tmp/project")
    assert snapshot["cwd"] == "/tmp/project"

    config = yaml.safe_load((hermes_home / "config.yaml").read_text(encoding="utf-8"))
    assert config["model"] == "openai/gpt-5"
    assert config["toolsets"] == ["hermes-cli", "browser"]
    assert config["approvals"]["mode"] == "off"
    assert config["terminal"]["cwd"] == "/tmp/project"


def test_load_snapshot_returns_defaults(tmp_path, monkeypatch):
    hermes_home = tmp_path / ".hermes"
    hermes_home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(hermes_home))

    snapshot = load_snapshot()

    assert snapshot["model"] == ""
    assert snapshot["toolsets"]
    assert snapshot["approvals_mode"] == "manual"
    assert snapshot["config_path"] == str(Path(hermes_home) / "config.yaml")


def test_load_snapshot_reads_nested_model_default(tmp_path, monkeypatch):
    hermes_home = tmp_path / ".hermes"
    hermes_home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(hermes_home))

    (hermes_home / "config.yaml").write_text(
        yaml.safe_dump({
            "model": {"default": "openai/gpt-5", "provider": "custom"},
            "toolsets": ["hermes-cli"],
        }),
        encoding="utf-8",
    )

    snapshot = load_snapshot()

    assert snapshot["model"] == "openai/gpt-5"
