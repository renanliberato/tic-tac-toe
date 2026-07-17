import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  const directory = mkdtempSync(path.join(os.tmpdir(), "worktree-merge-test-"));
  temporaryDirectories.push(directory);
  const remote = path.join(directory, "remote.git");
  const main = path.join(directory, "repo");
  runGit(directory, "init", "--quiet", "--bare", remote);
  runGit(directory, "init", "--quiet", main);
  runGit(main, "config", "user.email", "test@example.com");
  runGit(main, "config", "user.name", "Worktree Test");
  writeFileSync(path.join(main, "README"), "base\n");
  for (const script of ["git-sync", "git-worktree-merge"]) {
    const target = path.join(main, script);
    writeFileSync(target, readFileSync(path.join(repositoryRoot, script), "utf8"));
    chmodSync(target, 0o755);
  }
  runGit(main, "add", "README", "git-sync", "git-worktree-merge");
  runGit(main, "commit", "--quiet", "-m", "base");
  runGit(main, "branch", "-M", "main");
  runGit(main, "remote", "add", "origin", remote);
  runGit(main, "push", "--quiet", "--set-upstream", "origin", "main");
  return main;
}

function worktreeCount(directory) {
  return runGit(directory, "worktree", "list", "--porcelain").match(/^worktree /gm)?.length ?? 0;
}

function mergeLockPath(directory) {
  return path.resolve(directory, runGit(directory, "rev-parse", "--git-common-dir").trim(), "git-worktree-merge.lock");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("git-worktree-merge", () => {
  it("removes the merged worktree directory and its branch", () => {
    const repository = createRepository();
    const worktreeParent = path.join(repository, ".worktrees");
    const worktree = path.join(worktreeParent, "abc123");
    mkdirSync(worktreeParent);
    runGit(repository, "worktree", "add", "--quiet", "-b", "abc123", worktree);
    writeFileSync(path.join(worktree, "README"), "base\nchange\n");
    writeFileSync(path.join(worktree, "untracked-file"), "remove me\n");
    runGit(worktree, "add", "README");
    runGit(worktree, "commit", "--quiet", "-m", "change");

    const result = spawnSync("./git-worktree-merge", { cwd: worktree, encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(existsSync(worktree)).toBe(false);
    expect(existsSync(worktreeParent)).toBe(false);
    expect(worktreeCount(repository)).toBe(1);
    expect(() => runGit(repository, "show-ref", "--verify", "refs/heads/abc123")).toThrow();
    expect(readFileSync(path.join(repository, "README"), "utf8")).toBe("base\nchange\n");
  }, 30000);

  it("waits for the merge lock after synchronization", () => {
    const repository = createRepository();
    const worktreeParent = path.join(repository, ".worktrees");
    const worktree = path.join(worktreeParent, "abc123");
    mkdirSync(worktreeParent);
    runGit(repository, "worktree", "add", "--quiet", "-b", "abc123", worktree);
    writeFileSync(path.join(worktree, "README"), "base\nchange\n");
    runGit(worktree, "add", "README");
    runGit(worktree, "commit", "--quiet", "-m", "change");
    runGit(worktree, "push", "--quiet", "--set-upstream", "origin", "abc123");

    // Make synchronization a no-op so the lock is deliberately contended at
    // git-worktree-merge's own acquisition point.
    writeFileSync(path.join(repository, "git-sync"), "#!/bin/sh\nexit 0\n");
    chmodSync(path.join(repository, "git-sync"), 0o755);
    const lock = mergeLockPath(repository);
    writeFileSync(lock, "merge in progress\n");

    const result = spawnSync("sh", [
      "-c",
      "(sleep 0.2; rm -f -- \"$1\") & exec ./git-worktree-merge",
      "worktree-merge-test",
      lock
    ], { cwd: worktree, encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain("another merge holds");
    expect(existsSync(worktree)).toBe(false);
    expect(worktreeCount(repository)).toBe(1);
  }, 30000);
});
