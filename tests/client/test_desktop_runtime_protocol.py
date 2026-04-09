import io
import json
import sys

from client.runtime.protocol import ProtocolWriter, parse_request


def test_parse_request_accepts_valid_frame():
    payload = parse_request(json.dumps({
        "request_id": "req_1",
        "type": "config.get",
        "payload": {},
    }))
    assert payload["request_id"] == "req_1"
    assert payload["type"] == "config.get"
    assert payload["payload"] == {}


def test_protocol_writer_emits_json_line(monkeypatch):
    fake_stdout = io.StringIO()
    monkeypatch.setattr(sys, "__stdout__", fake_stdout)

    writer = ProtocolWriter()
    writer.event("ready", {"pid": 123})
    writer.response("req_1", ok=True, data={"status": "ok"})

    lines = [json.loads(line) for line in fake_stdout.getvalue().strip().splitlines()]
    assert lines[0]["type"] == "ready"
    assert lines[0]["payload"]["pid"] == 123
    assert lines[1]["request_id"] == "req_1"
    assert lines[1]["data"]["status"] == "ok"
