import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { cwd, env } from "node:process";
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
  mkdirSync(path.join(main, "tasks"));
  writeFileSync(path.join(main, "tasks", ".gitkeep"), "");
  for (const script of ["git-sync", "git-worktree-merge", "task-session"]) {
    const target = path.join(main, script);
    writeFileSync(target, readFileSync(path.join(repositoryRoot, script), "utf8"));
    chmodSync(target, 0o755);
  }
  runGit(main, "add", "README", "git-sync", "git-worktree-merge", "task-session", "tasks/.gitkeep");
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

  it("folds a primary-sync conflict transcript into the merge without a path collision", () => {
    const repository = createRepository();
    writeFileSync(path.join(repository, "git-sync"), `#!/bin/sh
printf 'primary sync conflict transcript\n' > "tasks/$DEV_FLOW_TASK_ID-session-sync-conflict-resolver.md"
`);
    chmodSync(path.join(repository, "git-sync"), 0o755);
    runGit(repository, "add", "git-sync");
    runGit(repository, "commit", "--quiet", "-m", "simulate primary sync conflict");

    const worktreeParent = path.join(repository, ".worktrees");
    const worktree = path.join(worktreeParent, "abc123");
    mkdirSync(worktreeParent);
    runGit(repository, "worktree", "add", "--quiet", "-b", "abc123", worktree);
    const branchTranscript = path.join(worktree, "tasks", "abc123-session-sync-conflict-resolver.md");
    writeFileSync(branchTranscript, "worktree sync conflict transcript\n");
    runGit(worktree, "add", branchTranscript);
    runGit(worktree, "commit", "--quiet", "-m", "record worktree sync conflict");

    const result = spawnSync("./git-worktree-merge", {
      cwd: worktree,
      encoding: "utf8",
      env: { ...env, DEV_FLOW_TASK_ID: "abc123" }
    });

    const firstAttempt = path.join(repository, "tasks", "abc123-session-sync-conflict-resolver-01.md");
    const secondAttempt = path.join(repository, "tasks", "abc123-session-sync-conflict-resolver-02.md");
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(worktree)).toBe(false);
    expect(existsSync(path.join(repository, "tasks", "abc123-session-sync-conflict-resolver.md"))).toBe(false);
    expect(readFileSync(firstAttempt, "utf8")).toContain("worktree sync conflict transcript");
    expect(readFileSync(secondAttempt, "utf8")).toContain("primary sync conflict transcript");
    expect(runGit(repository, "ls-files", "tasks")).toContain("tasks/abc123-session-sync-conflict-resolver-01.md");
    expect(runGit(repository, "ls-files", "tasks")).toContain("tasks/abc123-session-sync-conflict-resolver-02.md");
    expect(runGit(repository, "status", "--porcelain")).toBe("");
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
    ], {
      cwd: worktree,
      encoding: "utf8",
      env: { ...env, GIT_WORKTREE_MERGE_LOCK_TIMEOUT: "999999999999999999999999999999999999999999" }
    });

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain("another merge holds");
    expect(result.stderr).not.toContain("integer expression expected");
    expect(existsSync(worktree)).toBe(false);
    expect(worktreeCount(repository)).toBe(1);
  }, 30000);
});
