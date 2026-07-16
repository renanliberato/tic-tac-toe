import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../public/css/styles.css", import.meta.url), "utf8");

function dialogRule() {
  return styles.match(/\.game dialog\s*\{([^}]*)\}/)?.[1] ?? "";
}

describe("dialog layout", () => {
  it("keeps the result dialog centered despite the theme margin reset", () => {
    expect(dialogRule()).toMatch(/(?:^|\n)\s*margin:\s*auto\s*;/);
  });
});
