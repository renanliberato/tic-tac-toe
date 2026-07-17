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
    {kind:"FINAL_CONFIRMATION",question:"Does this capture the shared understanding? Answer yes to confirm, or explain what should change.",recommendation:"Yes, if no decisions are missing."}
  ]}));
} else {
  fs.writeFileSync(task, "# Refined task\\n\\nAudience: families\\n\\nOffline: yes\\n");
  fs.writeFileSync(response, JSON.stringify({status:"REFINE_FINISHED",task_file:task}));
}
`);
  chmodSync(executable, 0o755);
  return directory;
}

function unrelatedConfirmationAgent() {
  const directory = mkdtempSync(path.join(tmpdir(), "refine-test-"));
  temporaryDirectories.push(directory);
  const executable = path.join(directory, "mswea");
  writeFileSync(executable, `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const prompt = args[args.indexOf("-t") + 1];
const response = prompt.match(/creating exactly this JSON file:\\n([^\\n]+)/)[1];
const task = prompt.match(/create this exact file:\\n([^\\n]+)/)[1];
let count = 0;
try { count = Number(fs.readFileSync(process.env.REFINE_COUNT, "utf8")); } catch {}
count += 1;
fs.writeFileSync(process.env.REFINE_COUNT, String(count));
if (count === 1) {
  fs.writeFileSync(response, JSON.stringify({status:"ASK_QUESTIONS",questions:[
    {kind:"FINAL_CONFIRMATION",question:"Should offline mode be enabled?",recommendation:"Yes, for resilience."}
  ]}));
} else {
  fs.writeFileSync(task, "# Unauthorized task\\n");
  fs.writeFileSync(response, JSON.stringify({status:"REFINE_FINISHED",task_file:task}));
}
`);
  chmodSync(executable, 0o755);
  return directory;
}

function prematureAgent() {
  const directory = mkdtempSync(path.join(tmpdir(), "refine-test-"));
  temporaryDirectories.push(directory);
  const executable = path.join(directory, "mswea");
  writeFileSync(executable, `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const prompt = args[args.indexOf("-t") + 1];
const response = prompt.match(/creating exactly this JSON file:\\n([^\\n]+)/)[1];
const task = prompt.match(/create this exact file:\\n([^\\n]+)/)[1];
fs.writeFileSync(task, "# Premature task\\n");
fs.writeFileSync(response, JSON.stringify({status:"REFINE_FINISHED",task_file:task}));
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
      input: "Families\nyes\nyes\n",
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
    expect(prompts).toContain("\"kind\": \"FINAL_CONFIRMATION\"");
    expect(prompts).toContain("\"confirmed\": true");
    expect(readFileSync(count, "utf8")).toBe("3");
  });

  it("answers every question automatically with recommendations and confirms the final round", () => {
    const bin = fakeAgent();
    const log = path.join(bin, "prompts.log");
    const count = path.join(bin, "count");
    const result = spawnSync("./refine", ["--auto", "Improve the game"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, REFINE_LOG: log, REFINE_COUNT: count, REFINE_MODEL: "test:model" },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("Your answer:");
    expect(result.stdout).toContain("Auto-answer: New players, for accessibility.");
    expect(result.stdout).toContain("Auto-answer: yes");
    expect(result.stdout).toMatch(/Refinement finished: \.\/tasks\/[a-f0-9]{6}-todo\.md/);

    const taskPath = result.stdout.match(/\.\/(tasks\/[a-f0-9]{6}-todo\.md)/)[1];
    generatedTasks.push(path.join(root, taskPath));
    const prompts = readFileSync(log, "utf8");
    expect(prompts).toContain("\"answer\": \"New players, for accessibility.\"");
    expect(prompts).toContain("\"answer\": \"yes\"");
    expect(prompts).toContain("\"confirmed\": true");
    expect(readFileSync(count, "utf8")).toBe("3");
  });

  it("rejects an unrelated question tagged as final confirmation", () => {
    const bin = unrelatedConfirmationAgent();
    const count = path.join(bin, "count");
    const result = spawnSync("./refine", ["Improve the game"], {
      cwd: root,
      input: "yes\n",
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, REFINE_COUNT: count, REFINE_MODEL: "test:model" },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("FINAL_CONFIRMATION must use the canonical confirmation question");
    expect(result.stdout).not.toContain("Should offline mode be enabled?");
    expect(result.stdout).not.toContain("Refinement finished:");
    expect(readFileSync(count, "utf8")).toBe("1");
  });

  it("rejects completion before the user confirms shared understanding", () => {
    const bin = prematureAgent();
    const result = spawnSync("./refine", ["Improve the game"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, REFINE_MODEL: "test:model" },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("REFINE_FINISHED requires an answered, explicit final confirmation");
    expect(result.stdout).not.toContain("Refinement finished:");
  });

  it("prints usage without a prompt", () => {
    const result = spawnSync("./refine", [], { cwd: root, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("usage: ./refine [--auto] PROMPT");
  });
});
