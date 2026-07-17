import { readFileSync } from "node:fs";
import { cwd, env } from "node:process";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = cwd();
const lockScripts = ["git-sync", "git-worktree-create", "git-worktree-merge"];

function normalizationBlock(script) {
  const source = readFileSync(path.join(repositoryRoot, script), "utf8");
  const block = source.match(/^merge_lock_timeout=\$\{GIT_WORKTREE_MERGE_LOCK_TIMEOUT:-30\}[\s\S]*?^fi\n\n/m)?.[0];

  if (!block) {
    throw new Error(`could not find timeout normalization block in ${script}`);
  }
  return block;
}

function normalizeTimeout(script, value) {
  const result = spawnSync("sh", ["-c", `${normalizationBlock(script)}printf '%s\\n' "$merge_lock_timeout"`], {
    encoding: "utf8",
    env: { ...env, GIT_WORKTREE_MERGE_LOCK_TIMEOUT: value }
  });

  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  return result.stdout.trim();
}

describe("lock timeout normalization", () => {
  it("uses one-pass leading-zero normalization in every lock script", () => {
    for (const script of lockScripts) {
      const source = readFileSync(path.join(repositoryRoot, script), "utf8");

      expect(source).toContain("merge_lock_timeout=$(printf '%s' \"$merge_lock_timeout\" | sed 's/^0*//')");
      expect(source).not.toContain("while [ \"${merge_lock_timeout#0}\"");
    }
  });

  it("caps only values above the signed 32-bit maximum at runtime", () => {
    const boundaryValues = [
      ["2147483647", "2147483647"],
      ["2147483648", "2147483647"],
      ["2147490000", "2147483647"]
    ];

    for (const script of lockScripts) {
      for (const [input, expected] of boundaryValues) {
        expect(normalizeTimeout(script, input), `${script}: ${input}`).toBe(expected);
      }
    }
  });
});
