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

describe("scaled game layout", () => {
  it("gives the home screen and text intentional design-canvas sizes", () => {
    expect(styles).toMatch(/\.game #home-screen\s*\{[^}]*width:\s*min\(100%,\s*var\(--home-width\)\)/s);
    expect(styles).toMatch(/\.game #home-screen\s*\{[^}]*min-height:\s*var\(--home-height\)/s);
    expect(styles).toMatch(/\.game #home-screen h2\s*\{[^}]*font-size:\s*64px/s);
    expect(styles).toMatch(/\.game #home-screen p\s*\{[^}]*font-size:\s*40px/s);
  });

  it("caps the board and distributes its cells across the board", () => {
    expect(styles).toMatch(/\.game \.board\s*\{[^}]*width:\s*min\(100%,\s*var\(--board-width\)\)/s);
    expect(styles).toMatch(/\.game \.board\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
    expect(styles).not.toMatch(/grid-template-columns:\s*repeat\(3,\s*minmax\(4\.5rem,\s*5rem\)\)/);
  });
});
