"""Capability-restricted mini-SWE environment for web research.

The agent can issue one ``researchctl`` JSON action at a time.  This class never
starts a shell for the agent: it talks only to the project's trusted Node helper,
which owns the browser and the two allowed staging-file writes.
"""
import atexit
import json
import os
from pathlib import Path
import subprocess
from pydantic import BaseModel
from minisweagent.exceptions import Submitted


class ResearchEnvironmentConfig(BaseModel):
    cwd: str = ""
    max_read_bytes: int = 16384


class ResearchEnvironment:
    _actions = {"list", "read", "search", "open-result", "open-link", "write-report", "write-response"}
    _keys = {"action", "path", "query", "handle", "content"}

    def __init__(self, *, config_class=ResearchEnvironmentConfig, **kwargs):
        self.config = config_class(**kwargs)
        self._helper = None
        self._root = Path(self.config.cwd or os.getcwd()).resolve()
        self._report = self._staging_path("RESEARCH_STAGING_REPORT")
        self._response = self._staging_path("RESEARCH_RESPONSE_FILE")
        self._ledger = self._staging_path("RESEARCH_LEDGER_FILE")
        atexit.register(self.close)

    def _staging_path(self, name):
        value = os.environ.get(name)
        if not value:
            raise RuntimeError(f"{name} is required for ResearchEnvironment")
        return Path(value).resolve()

    @staticmethod
    def _result(output, returncode=0):
        return {"output": output, "returncode": returncode, "exception_info": ""}

    def _parse(self, command):
        if not isinstance(command, str) or not command.startswith("researchctl ") or "\n" in command:
            raise ValueError("only a single researchctl JSON action is permitted")
        request = json.loads(command[12:])
        if not isinstance(request, dict) or set(request) - self._keys or request.get("action") not in self._actions:
            raise ValueError("invalid action")
        return request

    def _validate(self, request):
        action = request["action"]
        allowed = {
            "list": {"action"},
            "read": {"action", "path"},
            "search": {"action", "query"},
            "open-result": {"action", "handle"},
            "open-link": {"action", "handle"},
            "write-report": {"action", "path", "content"},
            "write-response": {"action", "path", "content"},
        }[action]
        if set(request) != allowed:
            raise ValueError(f"invalid arguments for {action}")
        if action == "read" and Path(request["path"]).resolve() not in {self._report, self._response}:
            raise ValueError("read path is not a staging artifact")
        if action in {"search"} and (not isinstance(request["query"], str) or not request["query"].strip()):
            raise ValueError("search query is required")
        if action in {"open-result", "open-link"} and (not isinstance(request["handle"], str) or not request["handle"]):
            raise ValueError("opaque result handle is required")
        if action in {"write-report", "write-response"}:
            target = self._report if action == "write-report" else self._response
            if Path(request["path"]).resolve() != target:
                raise ValueError("writes are limited to the assigned staging artifact")
            if not isinstance(request["content"], str) or len(request["content"].encode()) > self.config.max_read_bytes:
                raise ValueError("output is invalid or too large")

    def _start_helper(self):
        if self._helper and self._helper.poll() is None:
            return
        helper = self._root / "scripts" / "research-helper.mjs"
        if not helper.is_file():
            raise RuntimeError("trusted research helper is unavailable")
        profile = os.environ.get("RESEARCH_BROWSER_PROFILE", str(self._root / ".research-browser-profile"))
        timeout = os.environ.get("RESEARCH_NAVIGATION_TIMEOUT_SECONDS", "20")
        searches = os.environ.get("RESEARCH_MAX_SEARCHES", "5")
        opens = os.environ.get("RESEARCH_MAX_OPENS", "30")
        self._helper = subprocess.Popen(
            ["node", str(helper), "serve", profile, timeout, searches, opens, str(self._ledger), str(self._report), str(self._response)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
        )

    def _delegate(self, request):
        self._start_helper()
        self._helper.stdin.write(json.dumps(request, separators=(",", ":")) + "\n")
        self._helper.stdin.flush()
        line = self._helper.stdout.readline()
        if not line:
            raise RuntimeError("trusted research helper stopped unexpectedly")
        reply = json.loads(line)
        if not reply.get("ok"):
            raise ValueError(reply.get("error", "trusted helper rejected action"))
        return reply.get("data")

    def execute(self, action, cwd=""):
        command = action.get("command", "") if isinstance(action, dict) else ""
        if command == "echo COMPLETE_TASK_AND_SUBMIT_FINAL_OUTPUT":
            raise Submitted({"role": "exit", "content": "", "extra": {"exit_status": "Submitted", "submission": ""}})
        try:
            request = self._parse(command)
            self._validate(request)
            return self._result(json.dumps(self._delegate(request), ensure_ascii=False) + "\n")
        except Exception as exc:
            return self._result(f"rejected: {exc}\n", 1)

    def close(self):
        if self._helper and self._helper.poll() is None:
            try:
                self._helper.stdin.close()
                self._helper.wait(timeout=2)
            except Exception:
                self._helper.kill()
        self._helper = None

    def get_template_vars(self, **kwargs):
        return {**self.config.model_dump(), **kwargs}

    def serialize(self):
        return {"info": {"config": {"environment": self.config.model_dump(), "environment_type": f"{__name__}.ResearchEnvironment"}}}
