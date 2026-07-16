import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";

const styles = readFileSync(new URL("../public/css/styles.css", import.meta.url), "utf8");

function dialogRule() {
  return styles.match(/\.game dialog\s*\{([^}]*)\}/)?.[1] ?? "";
}

describe("dialog layout", () => {
  it("centers both top-layer dialogs in the viewport before scaling", () => {
    expect(dialogRule()).toMatch(/(?:^|\n)\s*position:\s*fixed\s*;/);
    expect(dialogRule()).toMatch(/(?:^|\n)\s*top:\s*50%\s*;/);
    expect(dialogRule()).toMatch(/(?:^|\n)\s*left:\s*50%\s*;/);
    expect(dialogRule()).toMatch(/(?:^|\n)\s*margin:\s*0\s*;/);
    expect(dialogRule()).toMatch(/(?:^|\n)\s*transform:\s*translate\(-50%,\s*-50%\)\s+scale\(var\(--page-scale,\s*1\)\)\s*;/);
  });

  it("scales top-layer dialogs with the design canvas", () => {
    expect(dialogRule()).toMatch(/(?:^|\n)\s*width:\s*720px\s*;/);
    expect(dialogRule()).toMatch(/(?:^|\n)\s*max-height:\s*none\s*;/);
    expect(dialogRule()).toMatch(/(?:^|\n)\s*transform:\s*translate\(-50%,\s*-50%\)\s+scale\(var\(--page-scale,\s*1\)\)\s*;/);
    expect(styles).not.toMatch(/\.game dialog\s*\{[^}]*width:\s*min\(720px,\s*calc\(100%\s*-\s*96px\)\)/s);
  });
});

describe("screen visibility", () => {
  it("keeps a hidden home screen out of the rendered layout", () => {
    const dom = new JSDOM(`
      <style>${styles}</style>
      <main class="game">
        <section id="home-screen" hidden>Home</section>
      </main>
    `);
    const homeScreen = dom.window.document.querySelector("#home-screen");

    expect(homeScreen.hidden).toBe(true);
    expect(dom.window.getComputedStyle(homeScreen).display).toBe("none");

    dom.window.close();
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
