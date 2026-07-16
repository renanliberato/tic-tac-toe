import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { env } from "node:process";
import { join } from "node:path";
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

const browserPath = [
  env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
].find((candidate) => candidate && existsSync(candidate));

function browserFixture() {
  return `<!doctype html>
    <meta charset="utf-8">
    <style>${styles}</style>
    <main class="game">
      <dialog id="matchmaking-dialog" class="matchmaking-dialog">
        <div class="matchmaking-content">
          <div class="matchmaking-loader" aria-hidden="true">
            <span></span><span></span><span></span>
          </div>
          <p class="matchmaking-eyebrow">Quick-play queue</p>
          <h2>Who’s up for a showdown?</h2>
          <p class="matchmaking-message">Rounding up a worthy challenger...</p>
          <p class="matchmaking-tip">Warm up your best opening move — the board is almost yours.</p>
        </div>
      </dialog>
      <dialog id="result-dialog">
        <p class="result-eyebrow">Game over</p>
        <h2>Player X Won</h2>
        <p>Three in a row!</p>
        <button type="button">Continue</button>
      </dialog>
    </main>
    <script>
      const game = document.querySelector(".game");
      const scale = Math.min(innerWidth / 1125, innerHeight / 2436);
      game.style.setProperty("--page-scale", String(scale));
      const dialogs = [...document.querySelectorAll("dialog")];
      const measurements = dialogs.map((dialog) => {
        dialog.showModal();
        const box = dialog.getBoundingClientRect();
        dialog.close();
        return {
          id: dialog.id,
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          centerX: box.left + box.width / 2,
          centerY: box.top + box.height / 2
        };
      });
      document.body.dataset.layout = JSON.stringify({
        viewport: { width: innerWidth, height: innerHeight },
        scale,
        dialogs: measurements
      });
    </script>`;
}

function measureDialogsInBrowser(viewport) {
  return new Promise((resolve, reject) => {
    const directory = mkdtempSync(join(tmpdir(), "dialog-layout-"));
    const fixturePath = join(directory, "fixture.html");
    const profilePath = join(directory, "profile");
    writeFileSync(fixturePath, browserFixture());

    const browser = spawn(browserPath, [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--disable-crash-reporter",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profilePath}`,
      `--window-size=${viewport.width},${viewport.height}`,
      "--virtual-time-budget=500",
      "--dump-dom",
      `file://${fixturePath}`
    ], { stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    let settled = false;
    const timeout = globalThis.setTimeout(() => {
      finish(() => reject(new Error("The browser did not render the dialog fixture in time.")));
    }, 15000);

    function cleanup() {
      globalThis.clearTimeout(timeout);
      rmSync(directory, { recursive: true, force: true });
    }

    function finish(callback) {
      if (settled) return;
      settled = true;
      browser.kill("SIGKILL");
      cleanup();
      callback();
    }

    browser.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/data-layout="([^\"]+)"/);
      if (!match) return;

      try {
        const encodedLayout = match[1].replaceAll("&quot;", "\"");
        finish(() => resolve(JSON.parse(encodedLayout)));
      } catch (error) {
        finish(() => reject(error));
      }
    });
    browser.on("error", (error) => finish(() => reject(error)));
    browser.on("close", (code) => {
      if (!settled) {
        finish(() => reject(new Error(`The browser exited before rendering (code ${code}).`)));
      }
    });
  });
}

describe("rendered dialog layout", () => {
  it.skipIf(!browserPath)("centers and scales both dialogs at narrow and wide viewports", async () => {
    for (const requestedViewport of [{ width: 375, height: 812 }, { width: 1366, height: 1024 }]) {
      const layout = await measureDialogsInBrowser(requestedViewport);
      const expectedWidth = 720 * layout.scale;

      expect(layout.dialogs).toHaveLength(2);
      expect(layout.dialogs.map((dialog) => dialog.id)).toEqual([
        "matchmaking-dialog",
        "result-dialog"
      ]);
      for (const dialog of layout.dialogs) {
        expect(dialog.centerX).toBeCloseTo(layout.viewport.width / 2, 3);
        expect(dialog.centerY).toBeCloseTo(layout.viewport.height / 2, 3);
        expect(dialog.width).toBeCloseTo(expectedWidth, 3);
        expect(dialog.width).toBeGreaterThan(0);
        expect(dialog.height).toBeGreaterThan(0);
        expect(dialog.left).toBeGreaterThanOrEqual(0);
        expect(dialog.top).toBeGreaterThanOrEqual(0);
        expect(dialog.left + dialog.width).toBeLessThanOrEqual(layout.viewport.width);
        expect(dialog.top + dialog.height).toBeLessThanOrEqual(layout.viewport.height);
      }
    }
  }, 30000);
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
