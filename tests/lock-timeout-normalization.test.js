import { readFileSync } from "node:fs";
import { cwd } from "node:process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = cwd();
const lockScripts = ["git-sync", "git-worktree-create", "git-worktree-merge"];

describe("lock timeout normalization", () => {
  it("uses one-pass leading-zero normalization in every lock script", () => {
    for (const script of lockScripts) {
      const source = readFileSync(path.join(repositoryRoot, script), "utf8");

      expect(source).toContain("merge_lock_timeout=$(printf '%s' \"$merge_lock_timeout\" | sed 's/^0*//')");
      expect(source).not.toContain("while [ \"${merge_lock_timeout#0}\"");
    }
  });

  it("caps only values above the signed 32-bit maximum", () => {
    for (const script of lockScripts) {
      const source = readFileSync(path.join(repositoryRoot, script), "utf8");

      expect(source).not.toContain("21474[8-9]*");
      expect(source).toContain("214748364[8-9]*");
    }
  });
});
