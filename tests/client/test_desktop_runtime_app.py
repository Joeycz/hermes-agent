import io
import json

from client.runtime.app import DesktopRuntime


class DummyAgent:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self._interrupted = False

    def interrupt(self, message: str = None) -> None:
        self._interrupted = True

    def is_interrupted(self) -> bool:
        return self._interrupted


def test_session_start_list_and_title_update(tmp_path, monkeypatch):
    hermes_home = tmp_path / ".hermes"
    hermes_home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(hermes_home))

    runtime = DesktopRuntime()
    monkeypatch.setattr(runtime, "_make_agent", lambda session: DummyAgent(session.session_id))

    started = runtime.dispatch("session.start", {
        "cwd": str(tmp_path),
        "model": "openai/gpt-5",
        "toolsets": ["hermes-cli"],
    })

    assert started["session_id"]
    assert started["cwd"] == str(tmp_path)
    assert started["model"] == "openai/gpt-5"
    assert started["toolsets"] == ["hermes-cli"]
    assert started["busy"] is False

    listed = runtime.dispatch("session.list", {"limit": 10})
    assert listed["sessions"]
    assert listed["sessions"][0]["session_id"] == started["session_id"]

    updated = runtime.dispatch("session.title.set", {
        "session_id": started["session_id"],
        "title": "Desktop Session",
    })
    assert updated["title"] == "Desktop Session"


def test_message_send_marks_session_busy_and_interrupt_clears_fake_agent(tmp_path, monkeypatch):
    hermes_home = tmp_path / ".hermes"
    hermes_home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(hermes_home))

    runtime = DesktopRuntime()
    monkeypatch.setattr(runtime, "_make_agent", lambda session: DummyAgent(session.session_id))

    session = runtime.dispatch("session.start", {
        "cwd": str(tmp_path),
        "toolsets": ["hermes-cli"],
    })
    sid = session["session_id"]

    captured = {}

    def fake_run(session_obj, text):
        captured["text"] = text
        captured["session_id"] = session_obj.session_id

    monkeypatch.setattr(runtime, "_run_agent_turn", fake_run)

    response = runtime.dispatch("message.send", {
        "session_id": sid,
        "text": "Inspect this repo",
    })
    assert response["busy"] is True
    assert runtime._sessions[sid].busy is True
    runtime._sessions[sid].run_thread.join(timeout=2)
    assert captured == {"text": "Inspect this repo", "session_id": sid}

    interrupt = runtime.dispatch("agent.interrupt", {"session_id": sid})
    assert interrupt["session_id"] == sid
    assert runtime._sessions[sid].agent.is_interrupted() is True
