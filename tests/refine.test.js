import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const temporaryDirectories = [];
const generatedTasks = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
  for (const task of generatedTasks.splice(0)) rmSync(task, { force: true });
});

function fakeAgent() {
  const directory = mkdtempSync(path.join(tmpdir(), "refine-test-"));
  temporaryDirectories.push(directory);
  const executable = path.join(directory, "mswea");
  writeFileSync(executable, `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const prompt = args[args.indexOf("-t") + 1];
fs.appendFileSync(process.env.REFINE_LOG, prompt + "\\n---PROMPT---\\n");
const response = prompt.match(/creating exactly this JSON file:\\n([^\\n]+)/)[1];
const task = prompt.match(/create this exact file:\\n([^\\n]+)/)[1];
let count = 0;
try { count = Number(fs.readFileSync(process.env.REFINE_COUNT, "utf8")); } catch {}
count += 1;
fs.writeFileSync(process.env.REFINE_COUNT, String(count));
if (count === 1) {
  fs.writeFileSync(response, JSON.stringify({status:"ASK_QUESTIONS",questions:[
    {question:"Which audience should this serve?",recommendation:"New players, for accessibility."},
    {question:"Should it support offline use?",recommendation:"Yes, for resilience."}
  ]}));
} else if (count === 2) {
  fs.writeFileSync(response, JSON.stringify({status:"ASK_QUESTIONS",questions:[
    {question:"Does this capture the shared understanding?",recommendation:"Yes, if no decisions are missing."}
  ]}));
} else {
  fs.writeFileSync(task, "# Refined task\\n\\nAudience: families\\n\\nOffline: yes\\n");
  fs.writeFileSync(response, JSON.stringify({status:"REFINE_FINISHED",task_file:task}));
}
`);
  chmodSync(executable, 0o755);
  return directory;
}

describe("refine", () => {
  it("does not expose the user input descriptor to agents", () => {
    const source = readFileSync(path.join(root, "refine"), "utf8");
    expect(source).toContain("mswea \"$model\" --yolo --exit-immediately -t \"$prompt\" </dev/null 3<&-");
  });

  it("asks each generated question and creates the refined task", () => {
    const bin = fakeAgent();
    const log = path.join(bin, "prompts.log");
    const count = path.join(bin, "count");
    const result = spawnSync("./refine", ["Improve the game"], {
      cwd: root,
      input: "Families\nyes\nyes, confirmed\n",
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, REFINE_LOG: log, REFINE_COUNT: count, REFINE_MODEL: "test:model" },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("[1/2] Which audience should this serve?");
    expect(result.stdout).toContain("[2/2] Should it support offline use?");
    expect(result.stdout).toContain("[1/1] Does this capture the shared understanding?");
    expect(result.stdout).toMatch(/Refinement finished: \.\/tasks\/[a-f0-9]{6}-todo\.md/);
    const taskPath = result.stdout.match(/\.\/(tasks\/[a-f0-9]{6}-todo\.md)/)[1];
    generatedTasks.push(path.join(root, taskPath));
    expect(readFileSync(path.join(root, taskPath), "utf8")).toContain("# Refined task");

    const prompts = readFileSync(log, "utf8");
    expect(prompts).toContain("Improve the game");
    expect(prompts).toContain("Interview the user relentlessly");
    expect(prompts).toContain("\"answer\": \"Families\"");
    expect(prompts).toContain("\"answer\": \"yes\"");
    expect(prompts).toContain("\"answer\": \"yes, confirmed\"");
    expect(readFileSync(count, "utf8")).toBe("3");
  });

  it("prints usage without a prompt", () => {
    const result = spawnSync("./refine", [], { cwd: root, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("usage: ./refine PROMPT");
  });
});
