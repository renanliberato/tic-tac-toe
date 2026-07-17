import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { cwd, execPath } from "node:process";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = cwd();
const vitestPackageRoot = path.dirname(createRequire(import.meta.url).resolve("vitest/package.json"));
const temporaryDirectories = [];

function writeFixtureFile(filePath, contents) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Vitest configuration", () => {
  it("keeps dependency and worktree tests out of discovery", () => {
    const checkout = mkdtempSync(path.join("/tmp", "vitest-config-test-"));
    temporaryDirectories.push(checkout);
    const nodeModules = path.join(checkout, "node_modules");
    const config = path.join(checkout, "vitest.config.js");
    const report = path.join(checkout, "vitest-report.json");

    mkdirSync(nodeModules);
    symlinkSync(vitestPackageRoot, path.join(nodeModules, "vitest"), "dir");
    writeFileSync(config, `export { default } from ${JSON.stringify(path.join(repositoryRoot, "vitest.config.js"))};\n`);
    writeFixtureFile(
      path.join(checkout, "tests", "included.test.js"),
      `import { expect, it } from "vitest";
it("runs", () => expect(true).toBe(true));
`
    );
    writeFixtureFile(
      path.join(nodeModules, "dependency", "dependency.test.js"),
      `import { it } from "vitest";
it("must not run", () => { throw new Error("dependency test discovered"); });
`
    );
    writeFixtureFile(
      path.join(checkout, ".worktrees", "linked", "worktree.test.js"),
      `import { it } from "vitest";
it("must not run", () => { throw new Error("worktree test discovered"); });
`
    );

    const result = spawnSync(execPath, [
      path.join(vitestPackageRoot, "vitest.mjs"),
      "run",
      "--config",
      config,
      "--reporter=json",
      "--outputFile",
      report
    ], { cwd: checkout, encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(JSON.parse(readFileSync(report, "utf8")).testResults).toHaveLength(1);
  }, 20000);
});
