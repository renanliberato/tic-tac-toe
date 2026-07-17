import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import {
  BOARD_STYLES,
  getBoardStyle,
  isBoardStyleId,
  styleTokens
} from "../public/js/board-styles.js";
import { GameController } from "../public/js/controller.js";
import { GameModel } from "../public/js/model.js";
import {
  PLAYER_STORAGE_KEY,
  activatePlayerStyle,
  getOrCreatePlayer
} from "../public/js/player.js";
import { GameView } from "../public/js/view.js";

function createStorage(initialPlayer) {
  const values = new Map();
  if (initialPlayer) values.set(PLAYER_STORAGE_KEY, JSON.stringify(initialPlayer));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

const playerId = "123e4567-e89b-42d3-a456-426614174000";
let dom;
let originalStorage;

afterEach(() => {
  dom?.window.close();
  dom = undefined;
  if (originalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalStorage;
  originalStorage = undefined;
});

describe("board style player state", () => {
  it("keeps the catalog in the required order with exact prices", () => {
    expect(BOARD_STYLES.map(({ name, price }) => [name, price])).toEqual([
      ["Classic", 0], ["Forest", 9], ["Ocean", 19], ["Sunset", 29],
      ["Lavender", 39], ["Mint", 49], ["Midnight", 59], ["Desert", 69], ["Neon", 89]
    ]);
  });

  it("looks up validated styles, falls back to Classic, and exposes CSS tokens", () => {
    expect(isBoardStyleId("forest")).toBe(true);
    expect(isBoardStyleId("unknown")).toBe(false);
    expect(getBoardStyle("forest").name).toBe("Forest");
    expect(getBoardStyle("unknown").id).toBe("classic");
    expect(styleTokens("forest")).toBe(
      "--board-color:#31572c;--board-surface:#fff4d6;--cell-color:#fff4d6;" +
      "--cell-border-color:#31572c;--x-color:#246b3b;--o-color:#9a5b00"
    );
  });

  it("migrates legacy and malformed style state without losing player data", () => {
    const store = createStorage({
      player_id: playerId,
      wins: 4,
      owned_styles: ["forest", "unknown", "forest"],
      equipped_style: "unknown"
    });

    const player = getOrCreatePlayer(store);

    expect(player).toMatchObject({
      wins: 4,
      owned_styles: ["classic", "forest"],
      equipped_style: "classic"
    });
    expect(JSON.parse(store.getItem(PLAYER_STORAGE_KEY))).toEqual(player);
  });

  it("purchases once, switches owned styles for free, and rejects unaffordable styles", () => {
    const store = createStorage();
    let player = { ...getOrCreatePlayer(store), coin_balance: 20 };

    const purchased = activatePlayerStyle(player, "forest", store);
    expect(purchased).toMatchObject({ status: "purchased" });
    expect(purchased.player).toMatchObject({
      coin_balance: 11,
      owned_styles: ["classic", "forest"],
      equipped_style: "forest"
    });

    const noOp = activatePlayerStyle(purchased.player, "forest", store);
    expect(noOp).toMatchObject({ status: "equipped", player: purchased.player });

    const switched = activatePlayerStyle(noOp.player, "classic", store);
    expect(switched).toMatchObject({ status: "equipped-owned" });
    expect(switched.player.coin_balance).toBe(11);

    const insufficient = activatePlayerStyle(switched.player, "ocean", store);
    expect(insufficient).toMatchObject({ status: "insufficient", shortfall: 8 });
    expect(insufficient.player).toEqual(switched.player);
    expect(JSON.parse(store.getItem(PLAYER_STORAGE_KEY))).toEqual(switched.player);
  });
});

describe("profile and style screens", () => {
  it("renders stats and styles, applies purchases, and restores modal focus", () => {
    const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
    const store = createStorage({
      player_id: playerId,
      games_played: 3,
      moves_played: 12,
      wins: 2,
      draws: 0,
      losses: 1,
      coin_balance: 20,
      pending_coins: 3
    });
    originalStorage = globalThis.localStorage;
    globalThis.localStorage = store;
    dom = new JSDOM(html, { pretendToBeVisual: true });

    new GameController(new GameModel(), new GameView(dom.window.document));
    const document = dom.window.document;
    document.querySelector("#open-profile").click();

    expect(document.querySelector("#profile-screen").hidden).toBe(false);
    expect(document.activeElement.id).toBe("profile-title");
    expect(JSON.parse(store.getItem(PLAYER_STORAGE_KEY)).pending_coins).toBe(0);
    expect(document.querySelector("[data-stat=\"win_rate\"]").textContent).toBe("67%");

    document.querySelector("#open-styles").click();
    expect(document.querySelectorAll("[data-style-id]")).toHaveLength(9);
    const forest = document.querySelector("[data-style-id=\"forest\"]");
    forest.focus();
    forest.click();

    expect(document.activeElement).toBe(forest);
    expect(document.querySelector(".game").dataset.boardStyle).toBe("forest");
    expect(JSON.parse(store.getItem(PLAYER_STORAGE_KEY))).toMatchObject({
      coin_balance: 11,
      equipped_style: "forest"
    });
    expect(document.querySelector("#style-announcement").textContent)
      .toBe("Purchased and equipped Forest");
    expect(forest.querySelector(".style-state").textContent).toBe("✓ Equipped");

    const ocean = document.querySelector("[data-style-id=\"ocean\"]");
    ocean.click();
    expect(document.querySelector("#insufficient-message").textContent)
      .toBe("You need 8 more coins to unlock Ocean");
    document.querySelector("#insufficient-ok").click();
    expect(document.activeElement).toBe(ocean);

    document.querySelector("#styles-back").click();
    expect(document.querySelector("#profile-screen").hidden).toBe(false);
    expect(document.activeElement.id).toBe("open-styles");
    document.querySelector("#profile-back").click();
    expect(document.querySelector("#home-screen").hidden).toBe(false);
    expect(document.activeElement.id).toBe("open-profile");
  });
});
