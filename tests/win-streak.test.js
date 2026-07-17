import { afterEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import fs from "node:fs";
import { GameController } from "../public/js/controller.js";
import { GameModel } from "../public/js/model.js";
import { GameView } from "../public/js/view.js";
import { PLAYER_STORAGE_KEY, getOrCreatePlayer } from "../public/js/player.js";

const PLAYER_ID = "123e4567-e89b-42d3-a456-426614174000";

function createStorage(profile) {
  const values = new Map();
  if (profile) values.set(PLAYER_STORAGE_KEY, JSON.stringify({ player_id: PLAYER_ID, ...profile }));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}

class ViewStub {
  constructor() { this.cells = Array(9).fill(null); }
  onStart() {}
  onCell() {}
  onContinue() {}
  bindDialogGuards() {}
  render() {}
  enterHome() {}
  closeMatchmakingDialog() {}
  closeResultDialog() {}
  resetFeedback() {}
  showHome() {}
}

function createController(profile = {}) {
  const storage = createStorage(profile);
  globalThis.localStorage = storage;
  return { controller: new GameController(new GameModel(), new ViewStub()), storage };
}

afterEach(() => {
  delete globalThis.localStorage;
});

describe("persisted match win streak", () => {
  it("creates and migrates a zero streak without losing profile fields", () => {
    const fresh = getOrCreatePlayer(createStorage());
    const migrated = getOrCreatePlayer(createStorage({ wins: 8, coin_balance: 12 }));

    expect(fresh.win_streak).toBe(0);
    expect(migrated).toMatchObject({ wins: 8, coin_balance: 12, win_streak: 0 });
  });

  it.each([
    [undefined, 0], [-1, 0], [1.5, 0], ["2", 0], [NaN, 0],
    [0, 0], [1, 1], [2, 2], [3, 3], [4, 3], [100, 3]
  ])("normalizes streak %s to %s", (persisted, expected) => {
    const player = getOrCreatePlayer(createStorage({ win_streak: persisted }));
    expect(player.win_streak).toBe(expected);
  });

  it("increments only for decisive X wins and awards three then four coins", () => {
    for (const [streak, expectedStreak, expectedCoins] of [
      [0, 1, 3], [1, 2, 3], [2, 3, 4], [3, 3, 4]
    ]) {
      const { controller, storage } = createController({ win_streak: streak });
      controller.matchScore = { X: 2, O: 1 };
      controller.recordResult({ winner: "X", draw: false });
      controller.recordResult({ winner: "X", draw: false });

      expect(controller.player).toMatchObject({
        win_streak: expectedStreak,
        coin_balance: expectedCoins,
        pending_coins: expectedCoins
      });
      expect(JSON.parse(storage.getItem(PLAYER_STORAGE_KEY))).toEqual(controller.player);
    }
  });

  it("resets on a decisive O win without awarding coins, exactly once", () => {
    const { controller, storage } = createController({ win_streak: 3, coin_balance: 9 });
    controller.matchScore = { X: 1, O: 2 };

    controller.recordResult({ winner: "O", draw: false });
    controller.recordResult({ winner: "O", draw: false });

    expect(controller.player).toMatchObject({ win_streak: 0, coin_balance: 9, pending_coins: 0, losses: 1 });
    expect(JSON.parse(storage.getItem(PLAYER_STORAGE_KEY))).toEqual(controller.player);
  });

  it("leaves streak unchanged for intermediate boards, draws, and abandonment", () => {
    const { controller } = createController({ win_streak: 2 });
    controller.matchScore = { X: 1, O: 0 };
    controller.recordResult({ winner: "X", draw: false });
    expect(controller.player.win_streak).toBe(2);

    controller.resultRecorded = false;
    controller.recordResult({ winner: null, draw: true });
    expect(controller.player.win_streak).toBe(2);

    controller.resultRecorded = false;
    controller.showHome();
    expect(controller.player.win_streak).toBe(2);
  });
});

describe("home streak flames", () => {
  function createView() {
    const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
    const dom = new JSDOM(html);
    return { dom, view: new GameView(dom.window.document) };
  }

  it.each([0, 1, 2, 3])("renders %s filled flames from the left", (streak) => {
    const { dom, view } = createView();
    view.renderWinStreak(streak);
    const flames = [...dom.window.document.querySelectorAll("[data-streak-flame]")];

    expect(flames).toHaveLength(3);
    expect(flames.map((flame) => flame.classList.contains("streak-flame--filled")))
      .toEqual([0, 1, 2].map((index) => index < streak));
    expect(dom.window.document.querySelector("[data-win-streak-status]").textContent)
      .toBe(`Win streak: ${streak} of 3`);
  });

  it("is non-interactive, hides SVG artwork, and preserves the Play name", () => {
    const { dom } = createView();
    const documentRef = dom.window.document;
    expect(documentRef.querySelector("[data-win-streak]").getAttribute("role")).toBe("status");
    expect([...documentRef.querySelectorAll("[data-streak-flame]")]
      .every((flame) => flame.getAttribute("aria-hidden") === "true" && flame.getAttribute("focusable") === "false"))
      .toBe(true);
    expect(documentRef.querySelector("#start-game").getAttribute("aria-label")).toBe("Play");
  });

  it("uses a scoped, overlapping overlay with transparent and gradient flame fills", () => {
    const css = fs.readFileSync(new URL("../public/css/styles.css", import.meta.url), "utf8");
    expect(css).toContain(".game .win-streak");
    expect(css).toMatch(/\.game \.win-streak \{[\s\S]*pointer-events: none;[\s\S]*translateY\(-50%\)/);
    expect(css).toMatch(/\.game \.streak-flame__shape \{[\s\S]*fill: transparent;/);
    expect(css).toContain("fill: var(--streak-flame-fill)");
  });
});
