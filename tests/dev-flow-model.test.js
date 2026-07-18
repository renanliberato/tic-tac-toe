import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import process, { cwd } from "node:process";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = cwd();
const temporaryDirectories = [];
const defaultModel = "codex:gpt-5.6-luna@high";
const agentScripts = ["dev-flow", "git-commit", "code-review", "ensure-tests", "git-sync", "git-worktree-merge"];
const git = (directory, ...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8" });

function executable(directory, name, body) {
  const file = path.join(directory, name);
  writeFileSync(file, `#!/bin/sh\n${body}\n`);
  chmodSync(file, 0o755);
}
function sandbox() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "dev-flow-model-test-"));
  temporaryDirectories.push(directory);
  git(directory, "init", "--quiet");
  git(directory, "config", "user.email", "test@example.com");
  git(directory, "config", "user.name", "Flow Test");
  mkdirSync(path.join(directory, "tasks"));
  writeFileSync(path.join(directory, "README"), "test\n");
  git(directory, "add", "."); git(directory, "commit", "--quiet", "-m", "initial");
  for (const name of ["dev-flow", "task-session"]) {
    writeFileSync(path.join(directory, name), readFileSync(path.join(repositoryRoot, name), "utf8"));
    chmodSync(path.join(directory, name), 0o755);
  }
  const bin = path.join(directory, "bin"); mkdirSync(bin);
  executable(bin, "mswea", "printf \"mswea model=%s\\n\" \"$1\" >> \"$DEV_FLOW_LOG\"");
  executable(directory, "git-sync", "printf \"git-sync model=%s\\n\" \"$DEV_FLOW_MODEL\" >> \"$DEV_FLOW_LOG\"");
  executable(directory, "git-save", "git rev-parse HEAD > .git-save-hash; printf \"git-save model=%s\\n\" \"$DEV_FLOW_MODEL\" >> \"$DEV_FLOW_LOG\"");
  executable(directory, "git-commit", "git add -A; git commit -qm implementation; printf \"git-commit model=%s\\n\" \"$DEV_FLOW_MODEL\" >> \"$DEV_FLOW_LOG\"");
  executable(directory, "ensure-tests", "printf \"ensure-tests model=%s\\n\" \"$DEV_FLOW_MODEL\" >> \"$DEV_FLOW_LOG\"");
  executable(directory, "code-review", "printf \"code-review model=%s\\n\" \"$DEV_FLOW_MODEL\" >> \"$DEV_FLOW_LOG\"");
  executable(directory, "git-worktree-merge", "printf \"git-worktree-merge model=%s\\n\" \"$DEV_FLOW_MODEL\" >> \"$DEV_FLOW_LOG\"");
  executable(directory, "git-worktree-create", "printf \"git-worktree-create model=%s\\n\" \"$DEV_FLOW_MODEL\" >> \"$DEV_FLOW_LOG\"; printf \"%s\\n\" \"$PWD\"");
  executable(directory, "refine", `
    id=; while [ "$#" -gt 0 ]; do [ "$1" = --task-id ] && { shift; id=$1; }; shift || true; done
    printf '# refined\\n' > "tasks/$id-todo.md"
    git add "tasks/$id-todo.md"; git commit -qm 'docs: add refined task'
    printf 'refine model=%s\\n' "$DEV_FLOW_MODEL" >> "$DEV_FLOW_LOG"
    printf './tasks/%s-todo.md\\n' "$id"
  `);
  return { directory, bin, log: path.join(directory, "runtime.log") };
}
function run(args, model) {
  const value = sandbox();
  const env = { ...process.env, DEV_FLOW_LOG: value.log, PATH: `${value.bin}${path.delimiter}${process.env.PATH}` };
  if (model === undefined) delete env.DEV_FLOW_MODEL; else env.DEV_FLOW_MODEL = model;
  const result = spawnSync("./dev-flow", args, { cwd: value.directory, env, encoding: "utf8" });
  return { ...value, result, entries: existsSync(value.log) ? readFileSync(value.log, "utf8").trim().split("\n") : [] };
}
afterEach(() => temporaryDirectories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })));

describe("task-scoped dev-flow model propagation", () => {
  it("always refines a prompt, commits it, and leaves a done artifact", () => {
    const flow = run(["--refine-auto", "Add a leaderboard"]);
    expect(flow.result.status, flow.result.stderr).toBe(0);
    expect(flow.entries).toContain(`refine model=${defaultModel}`);
    expect(flow.entries).toContain(`mswea model=${defaultModel}`);
    const done = execFileSync("git", ["ls-files", "tasks"], { cwd: flow.directory, encoding: "utf8" });
    expect(done).toMatch(/tasks\/[a-f0-9]{6}-done\.md/);
    expect(done).toMatch(/tasks\/[a-f0-9]{6}-session-implementer\.md/);
  });
  it("propagates an explicitly selected model through each stage", () => {
    const flow = run(["a task"], "test:model@low");
    expect(flow.result.status, flow.result.stderr).toBe(0);
    expect(flow.entries.every(entry => entry.endsWith("model=test:model@low"))).toBe(true);
  });
  it("requires a prompt", () => {
    const flow = run([]);
    expect(flow.result.status).not.toBe(0);
    expect(flow.result.stderr).toContain("prompt is required");
  });
  it("keeps helper model fallbacks", () => {
    for (const script of agentScripts) expect(readFileSync(path.join(repositoryRoot, script), "utf8"), script).toContain("DEV_FLOW_MODEL");
    expect(readFileSync(path.join(repositoryRoot, "code-review"), "utf8")).toContain("default_agent=${DEV_FLOW_MODEL:-codex:gpt-5.6-luna@high}");
  });
});
