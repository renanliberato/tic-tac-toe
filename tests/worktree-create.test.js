import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import { cwd } from "node:process";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = cwd();
const temporaryDirectories = [];

function runGit(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function createRepository() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "worktree-create-test-"));
  temporaryDirectories.push(directory);
  runGit(directory, "init", "--quiet");
  runGit(directory, "config", "user.email", "test@example.com");
  runGit(directory, "config", "user.name", "Worktree Test");
  writeFileSync(path.join(directory, "README"), "test\n");
  writeFileSync(path.join(directory, "git-worktree-create"),
    readFileSync(path.join(repositoryRoot, "git-worktree-create"), "utf8"));
  chmodSync(path.join(directory, "git-worktree-create"), 0o755);
  runGit(directory, "add", "README", "git-worktree-create");
  runGit(directory, "commit", "--quiet", "-m", "test");
  return directory;
}

function worktreeCount(cwd) {
  return runGit(cwd, "worktree", "list", "--porcelain").match(/^worktree /gm)?.length ?? 0;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("git-worktree-create", () => {
  it("prints the created path when executed without changing the caller directory", () => {
    const repository = createRepository();
    const result = spawnSync("sh", ["-c", "before=$PWD; path=$(./git-worktree-create); printf '%s\\n%s\\n%s\\n' \"$before\" \"$PWD\" \"$path\""], {
      cwd: repository,
      encoding: "utf8"
    });
    const [before, after, worktreePath] = result.stdout.trim().split("\n");

    expect(result.status).toBe(0);
    expect(before).toBe(realpathSync(repository));
    expect(after).toBe(realpathSync(repository));
    expect(worktreePath).toMatch(new RegExp(`${escapeRegExp(realpathSync(repository))}/\\.worktrees/[0-9a-f]{6}$`));
    expect(worktreeCount(repository)).toBe(2);
  });

  it("changes the current shell to the new worktree when sourced", () => {
    const repository = createRepository();
    const result = spawnSync("sh", ["-c", ". ./git-worktree-create; pwd"], {
      cwd: repository,
      encoding: "utf8"
    });
    const [printedPath, currentDirectory] = result.stdout.trim().split("\n");

    expect(result.status).toBe(0);
    expect(printedPath).toBe(currentDirectory);
    expect(currentDirectory).toMatch(new RegExp(`${escapeRegExp(realpathSync(repository))}/\\.worktrees/[0-9a-f]{6}$`));
    expect(worktreeCount(repository)).toBe(2);
  });

  it("escapes regular-expression metacharacters in paths", () => {
    expect(escapeRegExp("/tmp/a.b[1]")).toBe("/tmp/a\\.b\\[1\\]");
  });
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
