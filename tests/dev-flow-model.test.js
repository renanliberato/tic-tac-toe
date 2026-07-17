import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import process, { cwd } from "node:process";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = cwd();
const temporaryDirectories = [];
const defaultModel = "codex:gpt-5.6-luna@high";
const agentScripts = ["dev-flow", "git-commit", "code-review", "ensure-tests", "git-sync", "git-worktree-merge"];

function runGit(directory, ...args) {
  return execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function createFlowSandbox() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "dev-flow-model-test-"));
  temporaryDirectories.push(directory);
  const binDirectory = path.join(directory, "bin");
  const logFile = path.join(directory, "runtime.log");

  runGit(directory, "init", "--quiet");
  writeFileSync(path.join(directory, "README"), "test\n");
  runGit(directory, "add", "README");
  runGit(directory, "-c", "user.email=test@example.com", "-c", "user.name=Flow Test", "commit", "--quiet", "-m", "test");

  writeFileSync(path.join(directory, "dev-flow"), readFileSync(path.join(repositoryRoot, "dev-flow"), "utf8"));
  chmodSync(path.join(directory, "dev-flow"), 0o755);

  mkdirSync(binDirectory);
  writeFileSync(path.join(binDirectory, "mswea"), `#!/bin/sh
printf 'mswea model=%s\\n' "$1" >> "$DEV_FLOW_LOG"
`);
  chmodSync(path.join(binDirectory, "mswea"), 0o755);

  for (const script of ["git-sync", "git-save", "git-commit", "ensure-tests", "code-review", "git-worktree-merge"]) {
    writeFileSync(path.join(directory, script), `#!/bin/sh
printf '%s model=%s\\n' "$0" "\${DEV_FLOW_MODEL:-unset}" >> "$DEV_FLOW_LOG"
`);
    chmodSync(path.join(directory, script), 0o755);
  }
  writeFileSync(path.join(directory, "git-worktree-create"), `#!/bin/sh
printf 'git-worktree-create model=%s\\n' "\${DEV_FLOW_MODEL:-unset}" >> "$DEV_FLOW_LOG"
printf '%s\\n' "$PWD"
`);
  chmodSync(path.join(directory, "git-worktree-create"), 0o755);

  return { directory, binDirectory, logFile };
}

function runFlow(model) {
  const sandbox = createFlowSandbox();
  const environment = {
    ...process.env,
    DEV_FLOW_LOG: sandbox.logFile,
    PATH: `${sandbox.binDirectory}${path.delimiter}${process.env.PATH ?? ""}`
  };
  if (model === undefined) {
    delete environment.DEV_FLOW_MODEL;
  } else {
    environment.DEV_FLOW_MODEL = model;
  }

  const result = spawnSync("./dev-flow", ["task"], {
    cwd: sandbox.directory,
    env: environment,
    encoding: "utf8"
  });
  return { ...sandbox, result, log: readFileSync(sandbox.logFile, "utf8").trim().split("\n") };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("DEV_FLOW_MODEL", () => {
  it("propagates a selected model through every dev-flow stage", () => {
    const model = "test:model@low";
    const { result, log } = runFlow(model);

    expect(result.status).toBe(0);
    expect(log).toEqual([
      `./git-sync model=${model}`,
      `git-worktree-create model=${model}`,
      `./git-save model=${model}`,
      `mswea model=${model}`,
      `./git-commit model=${model}`,
      `./ensure-tests model=${model}`,
      `./code-review model=${model}`,
      `./git-worktree-merge model=${model}`
    ]);
  }, 30000);

  it("uses the existing model as the fallback", () => {
    const { result, log } = runFlow(undefined);

    expect(result.status).toBe(0);
    expect(log).toContain(`mswea model=${defaultModel}`);
    expect(log.every((entry) => entry.endsWith(`model=${defaultModel}`))).toBe(true);
  }, 30000);

  it("uses the model setting in every helper that creates an agent", () => {
    for (const script of agentScripts) {
      const source = readFileSync(path.join(repositoryRoot, script), "utf8");
      expect(source, script).toContain("DEV_FLOW_MODEL");
    }
    expect(readFileSync(path.join(repositoryRoot, "code-review"), "utf8"))
      .toContain("default_agent=${DEV_FLOW_MODEL:-codex:gpt-5.6-luna@high}");
  });
});
