"""mini-SWE custom environment for untrusted web-research actions.
It never starts a shell.  Browser operations are delegated only to the trusted
project helper by the orchestration adapter; unsupported actions fail closed.
"""
import json
from pathlib import Path
from pydantic import BaseModel
from minisweagent.exceptions import Submitted

class ResearchEnvironmentConfig(BaseModel):
    cwd: str = ""
    max_read_bytes: int = 16384

class ResearchEnvironment:
    def __init__(self, *, config_class=ResearchEnvironmentConfig, **kwargs): self.config=config_class(**kwargs)
    def execute(self, action, cwd=""):
        command=action.get("command", "")
        if command == "echo COMPLETE_TASK_AND_SUBMIT_FINAL_OUTPUT":
            raise Submitted({"role":"exit","content":"","extra":{"exit_status":"Submitted","submission":""}})
        if not isinstance(command,str) or not command.startswith("researchctl ") or "\n" in command:
            return {"output":"rejected: only a single researchctl JSON action is permitted\n","returncode":1,"exception_info":""}
        try:
            request=json.loads(command[12:])
            allowed={"action","path","query","handle","content"}
            if not isinstance(request,dict) or set(request)-allowed or request.get("action") not in {"list","read","search","open-result","open-link","write-report","write-response"}: raise ValueError("invalid action")
            if "path" in request and (not Path(request["path"]).is_absolute() or ".." in Path(request["path"]).parts): raise ValueError("unsafe path")
            if len(request.get("content","").encode())>16384: raise ValueError("output too large")
        except Exception as exc:
            return {"output":f"rejected: {exc}\n","returncode":1,"exception_info":""}
        # The runtime adapter intentionally owns all capabilities; no command,
        # networking, subprocess, arbitrary read, or arbitrary write occurs here.
        return {"output":"accepted by ResearchEnvironment; delegated capability required\n","returncode":0,"exception_info":""}
    def get_template_vars(self, **kwargs): return {**self.config.model_dump(), **kwargs}
    def serialize(self): return {"info":{"config":{"environment":self.config.model_dump(),"environment_type":f"{__name__}.ResearchEnvironment"}}}
