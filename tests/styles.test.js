import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { env, platform as processPlatform } from "node:process";
import { join, win32 as windowsPath } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import puppeteer from "puppeteer";

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

function windowsBrowserPaths(environment) {
  return [
    environment.ProgramFiles,
    environment["ProgramFiles(x86)"],
    environment.ProgramW6432,
    environment.LOCALAPPDATA
  ]
    .filter(Boolean)
    .flatMap((root) => [
      windowsPath.join(root, "Google", "Chrome", "Application", "chrome.exe"),
      windowsPath.join(root, "Chromium", "Application", "chrome.exe")
    ]);
}

function browserPath({
  platform = processPlatform,
  environment = env,
  fileExists = existsSync,
  managedBrowserPath
} = {}) {
  const configuredPath = environment.BROWSER_PATH ?? environment.CHROME_PATH ?? environment.CHROMIUM_PATH;
  let managedPath = managedBrowserPath;

  if (managedPath === undefined) {
    try {
      managedPath = puppeteer.executablePath();
    } catch {
      managedPath = undefined;
    }
  }

  const windowsPaths = platform === "win32" ? windowsBrowserPaths(environment) : [];
  const executablePath = [
    configuredPath,
    managedPath,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    ...windowsPaths
  ].find(
    (candidate) => candidate && fileExists(candidate)
  );

  if (!executablePath) {
    throw new Error(
      "The rendered dialog layout test requires a Chromium executable. Run `npm install` to install Puppeteer’s managed browser, set BROWSER_PATH to an installed browser, or install Chrome/Chromium in a standard system location."
    );
  }

  return executablePath;
}

describe("system browser fallback", () => {
  it("finds Chrome in standard Windows installation directories", () => {
    const windowsEnvironment = {
      ProgramFiles: "C:\\Program Files",
      "ProgramFiles(x86)": "C:\\Program Files (x86)",
      LOCALAPPDATA: "C:\\Users\\Tester\\AppData\\Local"
    };
    const chromePath = (root) => windowsPath.join(
      root,
      "Google",
      "Chrome",
      "Application",
      "chrome.exe"
    );

    for (const expectedPath of [
      chromePath(windowsEnvironment.ProgramFiles),
      chromePath(windowsEnvironment.LOCALAPPDATA)
    ]) {
      expect(
        browserPath({
          platform: "win32",
          environment: windowsEnvironment,
          managedBrowserPath: null,
          fileExists: (candidate) => candidate === expectedPath
        })
      ).toBe(expectedPath);
    }
  });
});

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

async function measureDialogsInBrowser(viewport, executablePath) {
  const directory = mkdtempSync(join(tmpdir(), "dialog-layout-"));
  const fixturePath = join(directory, "fixture.html");
  writeFileSync(fixturePath, browserFixture());

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-gpu", "--disable-background-networking"]
    });
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.goto(pathToFileURL(fixturePath).href, { waitUntil: "load", timeout: 15000 });
    return await page.evaluate(() => JSON.parse(document.body.dataset.layout));
  } finally {
    await browser?.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

function gameplayCellFixture() {
  return `<!doctype html>
    <meta charset="utf-8">
    <style>${styles}</style>
    <main class="game">
      <section id="game-screen" class="screen">
        <div class="board" aria-label="Tic-Tac-Toe board">
          <button class="cell" type="button" data-cell="0" data-mark="X" aria-label="Cell 1, X">
            <svg class="mark-icon" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
              <path class="mark-icon__stroke" d="M24 24 76 76M76 24 24 76"></path>
            </svg>
          </button>
          <button class="cell" type="button" data-cell="1" aria-label="Cell 2"></button>
          <button class="cell" type="button" data-cell="2" aria-label="Cell 3"></button>
          <button class="cell" type="button" data-cell="3" aria-label="Cell 4"></button>
          <button class="cell" type="button" data-cell="4" aria-label="Cell 5"></button>
          <button class="cell" type="button" data-cell="5" aria-label="Cell 6"></button>
          <button class="cell" type="button" data-cell="6" aria-label="Cell 7"></button>
          <button class="cell" type="button" data-cell="7" aria-label="Cell 8"></button>
          <button class="cell" type="button" data-cell="8" aria-label="Cell 9"></button>
        </div>
      </section>
    </main>
    <script>
      const game = document.querySelector(".game");
      const scale = Math.min(innerWidth / 1125, innerHeight / 2436);
      game.style.setProperty("--page-scale", String(scale));
      const cell = document.querySelector('[data-cell="0"]');
      const svg = cell.querySelector("svg");
      const cellBox = cell.getBoundingClientRect();
      const svgBox = svg.getBoundingClientRect();
      document.body.dataset.layout = JSON.stringify({
        viewport: { width: innerWidth, height: innerHeight },
        scale,
        cell: {
          centerX: cellBox.left + cellBox.width / 2,
          centerY: cellBox.top + cellBox.height / 2
        },
        svg: {
          centerX: svgBox.left + svgBox.width / 2,
          centerY: svgBox.top + svgBox.height / 2
        }
      });
    </script>`;
}

async function measureGameplayCellInBrowser(viewport, executablePath) {
  const directory = mkdtempSync(join(tmpdir(), "gameplay-cell-layout-"));
  const fixturePath = join(directory, "fixture.html");
  writeFileSync(fixturePath, gameplayCellFixture());

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-gpu", "--disable-background-networking"]
    });
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.goto(pathToFileURL(fixturePath).href, { waitUntil: "load", timeout: 15000 });
    return await page.evaluate(() => JSON.parse(document.body.dataset.layout));
  } finally {
    await browser?.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("rendered dialog layout", () => {
  it("centers and scales both dialogs at narrow and wide viewports", async () => {
    const executablePath = browserPath();
    for (const requestedViewport of [{ width: 375, height: 812 }, { width: 1366, height: 1024 }]) {
      const layout = await measureDialogsInBrowser(requestedViewport, executablePath);
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


describe("matchmaking dialog typography", () => {
  it("uses 30% larger text without changing the shared dialog typography", () => {
    expect(styles).toMatch(/\.game \.matchmaking-dialog\s*\{[^}]*font-size:\s*27px/s);
    expect(styles).toMatch(/\.game \.matchmaking-dialog h2\s*\{[^}]*font-size:\s*47px/s);
    expect(styles).toMatch(/\.game dialog\s*\{[^}]*font-size:\s*32px/s);
    expect(styles).toMatch(/\.game dialog h2\s*\{[^}]*font-size:\s*56px/s);
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

describe("game screen visibility", () => {
  it("keeps a hidden game screen out of the rendered layout", () => {
    const dom = new JSDOM(`
      <style>${styles}</style>
      <main class="game">
        <section id="game-screen" hidden>Game</section>
      </main>
    `);
    const gameScreen = dom.window.document.querySelector("#game-screen");

    expect(gameScreen.hidden).toBe(true);
    expect(dom.window.getComputedStyle(gameScreen).display).toBe("none");

    dom.window.close();
  });
});

describe("game screen layout", () => {
  it("centers the gameplay column in the design canvas", () => {
    const gameScreenRule = styles.match(/\.game #game-screen\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(gameScreenRule).toMatch(/(?:^|\n)\s*display:\s*flex\s*;/);
    expect(gameScreenRule).toMatch(/(?:^|\n)\s*position:\s*relative\s*;/);
    expect(gameScreenRule).toMatch(/(?:^|\n)\s*flex:\s*1 1 auto\s*;/);
    expect(gameScreenRule).toMatch(/(?:^|\n)\s*flex-direction:\s*column\s*;/);
    expect(gameScreenRule).toMatch(/(?:^|\n)\s*align-items:\s*center\s*;/);
    expect(gameScreenRule).toMatch(/(?:^|\n)\s*justify-content:\s*center\s*;/);

    const activePlayerRule = styles.match(/\.game \.player-card--active\[data-player="local"\]\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(activePlayerRule).toMatch(/(?:^|\n)\s*border-color:\s*#b42318\s*;/);
    expect(activePlayerRule).toMatch(/(?:^|\n)\s*box-shadow:/);

    const statusRule = styles.match(/\.game #game-screen \.status\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(statusRule).toMatch(/(?:^|\n)\s*position:\s*absolute\s*;/);
    expect(statusRule).toMatch(/(?:^|\n)\s*bottom:\s*calc\(50% \+ var\(--board-half-width\) \+ 64px\)\s*;/);
  });
});

function battlePassAnimationFixture() {
  return `<!doctype html>
    <meta charset="utf-8">
    <style>${styles}</style>
    <main class="game">
      <div class="battle-pass-list battle-pass-list--entering">
        <button class="battle-pass-milestone battle-pass-milestone--vfx" type="button">First</button>
        <button class="battle-pass-milestone battle-pass-milestone--vfx" type="button">Second</button>
      </div>
    </main>
    <script>
      const cards = [...document.querySelectorAll(".battle-pass-milestone")];
      document.body.dataset.animations = JSON.stringify(cards.map((card) => {
        const computed = getComputedStyle(card);
        return {
          names: computed.animationName.split(",").map((name) => name.trim()),
          durations: computed.animationDuration.split(",").map((duration) => duration.trim()),
          delays: computed.animationDelay.split(",").map((delay) => delay.trim())
        };
      }));
    </script>`;
}

async function readBattlePassAnimationsInBrowser(executablePath) {
  const directory = mkdtempSync(join(tmpdir(), "battle-pass-animation-"));
  const fixturePath = join(directory, "fixture.html");
  writeFileSync(fixturePath, battlePassAnimationFixture());

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-gpu", "--disable-background-networking"]
    });
    const page = await browser.newPage();
    await page.goto(pathToFileURL(fixturePath).href, { waitUntil: "load", timeout: 15000 });
    return JSON.parse(await page.evaluate(() => document.body.dataset.animations));
  } finally {
    await browser?.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

function battlePassStaircaseFixture() {
  const row = (side) => `
    <div class="battle-pass-row battle-pass-row--${side}">
      <button class="battle-pass-milestone" type="button">Milestone</button>
      <span class="battle-pass-connector battle-pass-connector--${side}"></span>
      <span class="battle-pass-rail__node"></span>
    </div>`;

  return `<!doctype html>
    <meta charset="utf-8">
    <style>${styles}</style>
    <main class="game">
      <div class="battle-pass-scroll-content">${row("left")}${row("right")}</div>
    </main>`;
}

async function measureBattlePassStaircaseInBrowser(executablePath) {
  const directory = mkdtempSync(join(tmpdir(), "battle-pass-staircase-"));
  const fixturePath = join(directory, "fixture.html");
  writeFileSync(fixturePath, battlePassStaircaseFixture());

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-gpu", "--disable-background-networking"]
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1125, height: 900 });
    await page.goto(pathToFileURL(fixturePath).href, { waitUntil: "load", timeout: 15000 });
    return await page.evaluate(() => [...document.querySelectorAll(".battle-pass-row")].map((row) => {
      const center = (selector) => {
        const rect = row.querySelector(selector).getBoundingClientRect();
        return rect.top + rect.height / 2;
      };
      return {
        card: center(".battle-pass-milestone"),
        connector: center(".battle-pass-connector"),
        node: center(".battle-pass-rail__node")
      };
    }));
  } finally {
    await browser?.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("battle-pass staircase layout", () => {
  it("vertically aligns each odd and even card, connector, and node in a browser", async () => {
    const layout = await measureBattlePassStaircaseInBrowser(browserPath());

    expect(layout).toHaveLength(2);
    for (const { card, connector, node } of layout) {
      expect(connector).toBeCloseTo(card, 5);
      expect(node).toBeCloseTo(card, 5);
    }
  }, 30000);
});

describe("battle-pass animation cascade", () => {
  it("composes localized claim VFX with the initial entrance on the first cards", () => {
    const enteringRule = ".game .battle-pass-list--entering .battle-pass-milestone:nth-child(-n+8)";
    const vfxRule = ".game .battle-pass-list--entering .battle-pass-milestone.battle-pass-milestone--vfx:nth-child(-n+8)";
    const enteringRuleIndex = styles.indexOf(enteringRule);
    const vfxRuleIndex = styles.indexOf(vfxRule);
    const vfxDeclaration = styles.slice(vfxRuleIndex, styles.indexOf("}", vfxRuleIndex));

    expect(enteringRuleIndex).toBeGreaterThanOrEqual(0);
    expect(vfxRuleIndex).toBeGreaterThan(enteringRuleIndex);
    expect(vfxDeclaration).toMatch(/animation-name:\s*battle-pass-card-enter,\s*battle-pass-card-pulse/);
    expect(vfxDeclaration).toMatch(/animation-duration:\s*\.42s,\s*\.6s/);
    expect(vfxDeclaration).toMatch(/animation-timing-function:\s*ease-out,\s*ease-out/);
    expect(vfxDeclaration).toMatch(/animation-fill-mode:\s*both,\s*both/);
    expect(vfxDeclaration).not.toMatch(/animation:\s/);
  });

  it("keeps both animations and the entrance stagger during a claim overlap in a browser", async () => {
    const animations = await readBattlePassAnimationsInBrowser(browserPath());

    expect(animations).toHaveLength(2);
    for (const card of animations) {
      expect(card.names).toEqual(["battle-pass-card-enter", "battle-pass-card-pulse"]);
      expect(card.durations).toEqual(["0.42s", "0.6s"]);
    }
    expect(animations.map((card) => card.delays[0])).toEqual(["0s", "0.035s"]);
  }, 30000);

  it("keeps the first-card VFX override disabled for reduced motion", () => {
    expect(styles).toMatch(/\.game \.battle-pass-list--entering \.battle-pass-milestone\.battle-pass-milestone--vfx:nth-child\(-n\+8\),\s*\n\s*\.game \.battle-pass-particle \{ animation: none; \}/);
  });
});

describe("scaled game layout", () => {
  it("gives the home screen and title intentional design-canvas sizes", () => {
    expect(styles).toMatch(/\.game #home-screen\s*\{[^}]*width:\s*min\(100%,\s*var\(--home-width\)\)/s);
    expect(styles).toMatch(/\.game #home-screen\s*\{[^}]*min-height:\s*var\(--home-height\)/s);
    expect(styles).not.toMatch(/\.game #home-screen h2/);
    expect(styles).toMatch(/\.game #home-screen p\s*\{[^}]*font-size:\s*40px/s);
  });

  it("keeps the home controls at the edges and animates a centered preview", () => {
    expect(styles).toMatch(/\.game #home-screen\s*\{[^}]*justify-content:\s*space-between/s);
    expect(styles).toMatch(/\.game #home-screen\s*\{[^}]*padding:\s*72px 64px/s);
    expect(styles).toMatch(/\.game \.home-preview\s*\{[^}]*top:\s*50%/s);
    expect(styles).toMatch(/\.game \.home-preview\s*\{[^}]*left:\s*50%/s);
    expect(styles).toMatch(/\.game \.home-preview\s*\{[^}]*grid-template-columns:\s*repeat\(3/s);
    expect(styles).toMatch(/\.game \#start-game\s*\{[^}]*transform:\s*scale\(3\)/s);
    expect(styles).toMatch(/\.game \.home-preview-cell\s*\{[^}]*animation:\s*home-preview-place/s);
  });

  it("caps the board and distributes its cells across the board", () => {
    expect(styles).toMatch(/\.game \.board\s*\{[^}]*width:\s*min\(100%,\s*var\(--board-width\)\)/s);
    expect(styles).toMatch(/\.game \.board\s*\{[^}]*aspect-ratio:\s*1\b/s);
    expect(styles).toMatch(/\.game \.board\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
    expect(styles).toMatch(/\.game \.board\s*\{[^}]*grid-template-rows:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
    expect(styles).not.toMatch(/grid-template-columns:\s*repeat\(3,\s*minmax\(4\.5rem,\s*5rem\)\)/);
  });

  it("centers SVG marks inside each gameplay cell", async () => {
    expect(styles).toMatch(/\.game \.cell\s*\{[^}]*display:\s*grid/s);
    expect(styles).toMatch(/\.game \.cell\s*\{[^}]*place-items:\s*center/s);

    const layout = await measureGameplayCellInBrowser(
      { width: 375, height: 812 },
      browserPath()
    );

    expect(layout.scale).toBeCloseTo(1 / 3, 3);
    expect(layout.svg.centerX).toBeCloseTo(layout.cell.centerX, 1);
    expect(layout.svg.centerY).toBeCloseTo(layout.cell.centerY, 1);
  }, 30000);

  it("makes each cell fill its square grid track for a usable hit area", () => {
    expect(styles).toMatch(/\.game \.cell\s*\{[^}]*align-self:\s*stretch/s);
    expect(styles).toMatch(/\.game \.cell\s*\{[^}]*width:\s*100%/s);
    expect(styles).toMatch(/\.game \.cell\s*\{[^}]*height:\s*100%/s);
  });
});
