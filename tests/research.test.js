import { afterEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import readline from "node:readline";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { BrowserBoundary, canonicalUrl, validateReport } from "../scripts/research-helper.mjs";
import { parseResearchAction } from "../scripts/research-environment.mjs";

const temporaryDirectories = [];

function temporaryDirectory() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "research-helper-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function startResearchService(directory) {
  const report = path.join(directory, "report.md");
  const response = path.join(directory, "response.json");
  const child = spawn(process.execPath, [
    path.resolve("scripts/research-helper.mjs"), "serve", path.join(directory, "profile"), "5", "1", "1",
    path.join(directory, "ledger.json"), report, response
  ], { stdio: ["pipe", "pipe", "pipe"] });
  const replies = [];
  let resolveReply;
  const output = readline.createInterface({ input: child.stdout });
  output.on("line", line => {
    const reply = JSON.parse(line);
    if (resolveReply) {
      const resolve = resolveReply;
      resolveReply = undefined;
      resolve(reply);
    } else replies.push(reply);
  });
  return {
    report,
    response,
    request(action) {
      if (replies.length) return Promise.resolve(replies.shift());
      return new Promise((resolve, reject) => {
        resolveReply = resolve;
        child.stdin.write(`${JSON.stringify(action)}\n`, error => {
          if (error) {
            resolveReply = undefined;
            reject(error);
          }
        });
      });
    },
    async close() {
      child.stdin.end();
      await new Promise(resolve => child.once("exit", resolve));
      output.close();
    }
  };
}

function successfulReport(urls) {
  return [
    "# Research report",
    "",
    "## Sources consulted",
    ...urls.map((url, index) => `- Title: Source ${index} | URL: ${url} | Route: Google result | Evidence: This source supports the finding.`),
    "",
    "## Synthesis",
    "Evidence was reviewed.",
    "",
    "## Recommendations",
    "Use the evidence.",
    "",
    "## Risks and limitations",
    "Sources may change.",
    "",
    "## Repository applicability",
    "This applies to the repository."
  ].join("\n");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("research helper", () => {
  it("canonicalizes public HTTP(S) citations while removing fragments and tracking parameters", () => {
    expect(canonicalUrl("https://docs.example.com/guide?utm_source=newsletter&topic=tests#section"))
      .toBe("https://docs.example.com/guide?topic=tests");
    expect(canonicalUrl("http://docs.example.com/?ref=home&gclid=abc&keep=yes"))
      .toBe("http://docs.example.com/?keep=yes");
  });

  it("rejects citation URLs that could bypass the public HTTP(S) boundary", () => {
    for (const url of [
      "ftp://docs.example.com/file",
      "https://user:password@docs.example.com/",
      "https://docs.example.com:8443/",
      "http://127.0.0.1/private"
    ]) {
      expect(() => canonicalUrl(url)).toThrow("public default-port HTTP(S)");
    }
  });

  it("accepts a complete report whose ten unique citations are qualifying ledger entries", () => {
    const directory = temporaryDirectory();
    const urls = Array.from({ length: 10 }, (_, index) => `https://source${index}.example/article`);
    const report = path.join(directory, "report.md");
    const ledger = path.join(directory, "ledger.json");
    writeFileSync(report, successfulReport(urls));
    writeFileSync(ledger, JSON.stringify(urls.map((url) => ({
      url,
      title: `Source ${urls.indexOf(url)}`,
      opened: true,
      route: "Google result"
    }))));

    expect(validateReport(report, "/unused/expected-report.md", ledger)).toBe(10);
  });

  it("rejects reports with duplicate or non-qualifying cited evidence", () => {
    const directory = temporaryDirectory();
    const urls = Array.from({ length: 10 }, (_, index) => `https://source${index}.example/article`);
    const report = path.join(directory, "report.md");
    const ledger = path.join(directory, "ledger.json");
    writeFileSync(report, successfulReport([...urls.slice(0, 9), urls[0]]));
    writeFileSync(ledger, JSON.stringify(urls.map((url) => ({
      url,
      title: `Source ${urls.indexOf(url)}`,
      opened: true,
      route: "one-hop subpage"
    }))));

    expect(() => validateReport(report, "/unused/expected-report.md", ledger))
      .toThrow("ten unique cited URLs");
  });

  it("rejects source entries missing a title, route, or evidence note", () => {
    const directory = temporaryDirectory();
    const urls = Array.from({ length: 10 }, (_, index) => `https://source${index}.example/article`);
    const ledger = path.join(directory, "ledger.json");
    writeFileSync(ledger, JSON.stringify(urls.map((url, index) => ({
      url, title: `Source ${index}`, opened: true, route: "Google result"
    }))));
    for (const [name, replacement] of [
      ["title", "Title:  |"],
      ["route", "Route:  |"],
      ["evidence", "Evidence: " ]
    ]) {
      const report = path.join(directory, `${name}.md`);
      writeFileSync(report, successfulReport(urls).replace(
        "Title: Source 0 | URL:", replacement === "Title:  |" ? `${replacement} URL:` : "Title: Source 0 | URL:"
      ).replace(
        "Route: Google result |", replacement === "Route:  |" ? replacement : "Route: Google result |"
      ).replace(
        "Evidence: This source supports the finding.", replacement === "Evidence: " ? replacement : "Evidence: This source supports the finding."
      ));
      expect(() => validateReport(report, "/unused/expected-report.md", ledger))
        .toThrow("Title, URL, Route, and Evidence");
    }
  });

  it("creates Google-result handles only for organic result cards", async () => {
    const results = Array.from({ length: 10 }, (_, index) =>
      `<article><a href="https://source${index}.example/article"><h3>Organic result ${index}</h3></a></article>`
    ).join("");
    const dom = new JSDOM(`
      <nav>
        <a href="https://www.google.com/preferences">Settings</a>
        <a href="https://support.google.com/search">Learn more</a>
      </nav>
      <main id="search">${results}</main>
    `, { url: "https://www.google.com/search?q=evidence" });
    const boundary = new BrowserBoundary({ maxSearches: 1, maxOpens: 10 });
    boundary.page = {
      $$eval: async (selector, callback) => callback([...dom.window.document.querySelectorAll(selector)])
    };
    boundary.goto = async () => {};

    const handles = await boundary.search("evidence");

    expect(handles).toHaveLength(10);
    expect(handles.map(handle => handle.title)).toEqual(
      Array.from({ length: 10 }, (_, index) => `Organic result ${index}`)
    );
    expect(handles.map(handle => handle.url)).not.toContain("https://www.google.com/preferences");
    expect(handles.map(handle => handle.url)).not.toContain("https://support.google.com/search");
  });

  it("rejects CAPTCHA pages before their anchors can become Google-result handles", async () => {
    const dom = new JSDOM(`
      <main id="search">
        <a href="https://www.google.com/terms"><h3>Google Terms of Service</h3></a>
        <a href="https://support.google.com"><h3>Learn more</h3></a>
      </main>
      <p>Our systems have detected unusual traffic from your computer network.</p>
      <a href="https://www.google.com/sorry/index">Why did this happen?</a>
    `, { url: "https://www.google.com/sorry/index?continue=https://www.google.com/search" });
    const boundary = new BrowserBoundary({ maxSearches: 1, maxOpens: 10 });
    boundary.page = {
      $$eval: async (selector, callback) => callback([...dom.window.document.querySelectorAll(selector)])
    };
    boundary.goto = async () => {};

    await expect(boundary.search("evidence")).rejects.toThrow("challenge page");
    expect(boundary.handles.size).toBe(0);
  });

  it("rejects search pages that do not provide ten organic result cards", async () => {
    const dom = new JSDOM(`
      <main id="search">
        <a href="https://source.example/article"><h3>Only result</h3></a>
      </main>
    `, { url: "https://www.google.com/search?q=evidence" });
    const boundary = new BrowserBoundary({ maxSearches: 1, maxOpens: 10 });
    boundary.page = {
      $$eval: async (selector, callback) => callback([...dom.window.document.querySelectorAll(selector)])
    };
    boundary.goto = async () => {};

    await expect(boundary.search("evidence")).rejects.toThrow("fewer than ten organic results");
    expect(boundary.handles.size).toBe(0);
  });

  it("aborts a private redirect target before the browser continues it", async () => {
    const events = {};
    const page = {
      setRequestInterception: async () => {},
      on: (event, listener) => { events[event] = listener; }
    };
    const boundary = new BrowserBoundary({
      validateUrl: async url => {
        if (url.includes("127.0.0.1")) throw new Error("redirect target is private");
        return url;
      }
    });
    await boundary.installRequestGuard(page);
    const continued = [];
    const aborted = [];
    const request = url => ({
      url: () => url,
      isInterceptResolutionHandled: () => false,
      continue: async () => continued.push(url),
      abort: async () => aborted.push(url)
    });

    await events.request(request("https://public.example/result"));
    // Puppeteer emits a new request event for a Location redirect before it
    // loads the target; this must be rejected rather than followed.
    await events.request(request("http://127.0.0.1/metadata"));

    expect(continued).toEqual(["https://public.example/result"]);
    expect(aborted).toEqual(["http://127.0.0.1/metadata"]);
  });


  it("serves JSON actions only for its assigned staging artifacts", async () => {
    const directory = temporaryDirectory();
    const service = startResearchService(directory);
    try {
      expect(await service.request({ action: "list" })).toEqual({
        ok: true,
        data: { report: service.report, response: service.response, opened: [] }
      });
      expect(await service.request({ action: "write-report", path: service.report, content: "trusted report" }))
        .toEqual({ ok: true, data: { written: service.report } });
      expect(await service.request({ action: "write-response", path: service.response, content: "{}" }))
        .toEqual({ ok: true, data: { written: service.response } });
      expect(await service.request({ action: "read", path: service.report }))
        .toEqual({ ok: true, data: "trusted report" });
      expect(await service.request({ action: "write-report", path: path.join(directory, "outside.md"), content: "blocked" }))
        .toEqual({ ok: false, error: "report may only be written to its staging path" });
    } finally {
      await service.close();
    }
  });
});

describe("research action boundary", () => {
  it("accepts a single declared action with only supported arguments", () => {
    expect(parseResearchAction("researchctl {\"action\":\"search\",\"query\":\"safe evidence\"}"))
      .toEqual({ action: "search", query: "safe evidence" });
  });

  it("rejects shell-like, unsafe-path, and oversized actions", () => {
    expect(() => parseResearchAction("echo researchctl {}"))
      .toThrow("only one researchctl action");
    expect(() => parseResearchAction("researchctl {\"action\":\"read\",\"path\":\"../secret\"}"))
      .toThrow("unsafe path");
    expect(() => parseResearchAction(`researchctl ${JSON.stringify({
      action: "write-report",
      content: "x".repeat(16385)
    })}`)).toThrow("exceeds 16 KiB");
  });
});


describe("default research runner", () => {
  it("uses mswea with the research environment config when no test agent is supplied", () => {
    const directory = temporaryDirectory();
    execFileSync("git", ["init", "--quiet"], { cwd: directory });
    mkdirSync(path.join(directory, "tasks"));
    mkdirSync(path.join(directory, ".agents"));
    mkdirSync(path.join(directory, "bin"));
    for (const file of ["research", "task-session"]) {
      const source = path.join(process.cwd(), file);
      const target = path.join(directory, file);
      writeFileSync(target, readFileSync(source, "utf8"));
      chmodSync(target, 0o755);
    }
    writeFileSync(path.join(directory, ".agents", "research-mini.yaml"), readFileSync(path.join(process.cwd(), ".agents", "research-mini.yaml"), "utf8"));
    const helper = path.join(directory, "helper");
    writeFileSync(helper, `#!/bin/sh
case "$1" in preflight) echo ok ;; validate) echo 10 ;; *) exit 1 ;; esac
`);
    chmodSync(helper, 0o755);
    const runner = path.join(directory, "bin", "mswea");
    writeFileSync(runner, `#!/bin/sh
printf '%s\n' "$@" > "$RUNNER_ARGS"
{
  printf '# Research report\n\n## Sources consulted\n'
  i=0; while [ "$i" -lt 10 ]; do printf '%s\n' "- Title: Source $i | URL: https://source$i.example/article | Route: Google result | Evidence: Evidence $i"; i=$((i+1)); done
  printf '\n## Synthesis\nEvidence.\n\n## Recommendations\nUse it.\n\n## Risks and limitations\nLimits.\n\n## Repository applicability\nApplies.\n'
} > "$RESEARCH_STAGING_REPORT"
printf '{"status":"RESEARCH_FINISHED","research_file":"%s","source_count":10}\n' "$RESEARCH_EXPECTED_REPORT" > "$RESEARCH_RESPONSE_FILE"
`);
    chmodSync(runner, 0o755);
    const args = path.join(directory, "runner-args");
    const env = { ...process.env, PATH: `${path.join(directory, "bin")}${path.delimiter}${process.env.PATH}`, RESEARCH_HELPER: helper, RESEARCH_MAX_ATTEMPTS: "1", RUNNER_ARGS: args };
    delete env.RESEARCH_AGENT;
    const result = spawnSync("./research", ["--task-id", "abcdef", "--print-research-path", "research topic"], { cwd: directory, env, encoding: "utf8" });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("./tasks/abcdef-research.md");
    expect(readFileSync(args, "utf8")).toContain(".agents/research-mini.yaml");
    expect(readFileSync(path.join(directory, "tasks", "abcdef-research.md"), "utf8")).toContain("Title: Source 0");
  });
});
