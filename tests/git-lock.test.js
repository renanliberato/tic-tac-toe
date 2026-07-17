import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { cwd } from "node:process";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = cwd();
const temporaryDirectories = [];

function runGit(directory, ...args) {
  return execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function createRepository() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "git-lock-test-"));
  temporaryDirectories.push(directory);
  runGit(directory, "init", "--quiet");
  runGit(directory, "config", "user.email", "test@example.com");
  runGit(directory, "config", "user.name", "Lock Test");
  writeFileSync(path.join(directory, "README"), "test\n");
  runGit(directory, "add", "README");
  runGit(directory, "commit", "--quiet", "-m", "test");
  return directory;
}

function mergeLockPath(directory) {
  return path.resolve(directory, runGit(directory, "rev-parse", "--git-common-dir").trim(), "git-worktree-merge.lock");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("git merge lock", () => {
  it("waits for an existing merge lock before fetching", () => {
    const repository = createRepository();
    const sync = path.join(repository, "git-sync");
    writeFileSync(sync, readFileSync(path.join(repositoryRoot, "git-sync"), "utf8"));
    chmodSync(sync, 0o755);
    const lock = mergeLockPath(repository);
    writeFileSync(lock, "merge in progress\n");

    // git-sync has no remote in this fixture, so reaching fetch is the expected
    // failure. The background process releases the lock after the command has
    // had to wait for it.
    const result = spawnSync("sh", [
      "-c",
      "(sleep 0.2; rm -f -- \"$1\") & exec ./git-sync",
      "git-lock-test",
      lock
    ], { cwd: repository, encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("git-sync: git pull --rebase failed without leaving a conflict to resolve");
    expect(result.stderr).not.toContain("another merge holds");
  });
});
