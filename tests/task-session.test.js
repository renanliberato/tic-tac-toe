import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { cwd } from "node:process";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = cwd();
const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("task-session", () => {
  it("writes a failed transcript before returning to an errexit caller", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "task-session-test-"));
    temporaryDirectories.push(directory);
    mkdirSync(path.join(directory, "tasks"));
    const session = path.join(directory, "task-session");
    writeFileSync(session, readFileSync(path.join(repositoryRoot, "task-session"), "utf8"));
    chmodSync(session, 0o755);

    const result = spawnSync("sh", ["-c", [
      "set -e",
      ". ./task-session",
      "DEV_FLOW_TASK_ID=abc123",
      "task_session committer sh -c 'printf failed; exit 23'",
      "printf unreachable"
    ].join("\n")], { cwd: directory, encoding: "utf8" });

    const transcript = path.join(directory, "tasks", "abc123-session-committer.md");
    expect(result.status).toBe(23);
    expect(result.stdout).not.toContain("unreachable");
    expect(existsSync(transcript)).toBe(true);
    expect(readFileSync(transcript, "utf8")).toContain("- Exit status: 23");
    expect(readFileSync(transcript, "utf8")).toContain("failed");
  });
});
