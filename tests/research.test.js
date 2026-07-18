import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { canonicalUrl, validateReport } from "../scripts/research-helper.mjs";
import { parseResearchAction } from "../scripts/research-environment.mjs";

const temporaryDirectories = [];

function temporaryDirectory() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "research-helper-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function successfulReport(urls) {
  return [
    "# Research report",
    "",
    "## Sources consulted",
    ...urls.map((url) => `- ${url}`),
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
      opened: true,
      route: "one-hop subpage"
    }))));

    expect(() => validateReport(report, "/unused/expected-report.md", ledger))
      .toThrow("ten unique cited URLs");
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
