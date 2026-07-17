import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { GameController } from "../public/js/controller.js";
import { GameModel } from "../public/js/model.js";
import {
  PLAYER_STORAGE_KEY,
  awardCoins,
  consumePendingCoins,
  getOrCreatePlayer
} from "../public/js/player.js";
import { formatCoinBalance, GameView } from "../public/js/view.js";

function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
}

function createCoinDocument() {
  return new JSDOM(`
    <main class="game">
      <section id="home-screen">
        <div id="coin-holder"><span id="coin-amount"></span><span class="coin-plus">+</span></div>
        <p id="coin-announcement"></p>
        <div class="home-preview"></div>
        <button id="start-game" type="button"></button>
      </section>
      <section id="game-screen" hidden></section>
    </main>
  `, { pretendToBeVisual: true });
}

class ControllerViewStub {
  constructor() {
    this.cells = [];
  }
  onStart() {}
  onCell() {}
  onContinue() {}
  bindDialogGuards() {}
  render() {}
  finishCoinPresentation() {}
  closeMatchmakingDialog() {}
  closeResultDialog() {}
  resetFeedback() {}
}

let dom;
let originalStorage;

beforeEach(() => {
  vi.useFakeTimers();
  originalStorage = globalThis.localStorage;
});

afterEach(() => {
  vi.useRealTimers();
  if (dom) dom.window.close();
  if (originalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalStorage;
});

describe("coin profile state", () => {
  it("creates and migrates zero-valued coin fields, normalizing invalid values", () => {
    const store = storage();
    const id = "123e4567-e89b-42d3-a456-426614174000";
    store.setItem(PLAYER_STORAGE_KEY, JSON.stringify({
      player_id: id,
      coin_balance: -4,
      pending_coins: 1.5,
      wins: 4
    }));

    const player = getOrCreatePlayer(store);

    expect(player).toMatchObject({ wins: 4, coin_balance: 0, pending_coins: 0 });
    expect(JSON.parse(store.getItem(PLAYER_STORAGE_KEY))).toMatchObject({
      coin_balance: 0,
      pending_coins: 0
    });
  });

  it("adds coins to both durable and pending state, then consumes only pending state", () => {
    const store = storage();
    const player = getOrCreatePlayer(store);
    const earned = awardCoins(player, 10000, store);
    const consumed = consumePendingCoins(earned, store);

    expect(earned).toMatchObject({ coin_balance: 10000, pending_coins: 10000 });
    expect(consumed).toMatchObject({ coin_balance: 10000, pending_coins: 0 });
    expect(JSON.parse(store.getItem(PLAYER_STORAGE_KEY))).toEqual(consumed);
  });
});

describe("coin display and celebration", () => {
  it.each([[0, "0000"], [10, "0010"], [9999, "9999"], [10000, "9999"], [-1, "0000"]])(
    "formats %s as %s", (value, expected) => expect(formatCoinBalance(value)).toBe(expected)
  );

  it("presents a backlog with at most 20 icons and one completion announcement", () => {
    dom = createCoinDocument();
    const view = new GameView(dom.window.document);
    let consumed = 0;

    view.enterHome({ coin_balance: 23, pending_coins: 23 }, () => { consumed += 1; });

    expect(dom.window.document.querySelectorAll("[data-flying-coin]")).toHaveLength(20);
    expect(dom.window.document.querySelector("#coin-amount").textContent).toBe("0000");
    vi.advanceTimersByTime(1400);

    expect(consumed).toBe(1);
    expect(dom.window.document.querySelectorAll("[data-flying-coin]")).toHaveLength(0);
    expect(dom.window.document.querySelector("#coin-amount").textContent).toBe("0023");
    expect(dom.window.document.querySelector("#coin-holder").getAttribute("aria-label"))
      .toBe("Coin balance: 23");
    expect(dom.window.document.querySelector("#coin-announcement").textContent)
      .toBe("23 coins earned; balance 23");
  });

  it("centers each flying coin on the measured source and holder points", () => {
    dom = createCoinDocument();
    const home = dom.window.document.querySelector("#home-screen");
    const preview = dom.window.document.querySelector(".home-preview");
    const holder = dom.window.document.querySelector("#coin-holder");
    Object.defineProperties(home, {
      offsetWidth: { configurable: true, value: 760 },
      offsetHeight: { configurable: true, value: 520 }
    });
    home.getBoundingClientRect = () => ({ left: 100, top: 200, width: 760, height: 520 });
    preview.getBoundingClientRect = () => ({ left: 200, top: 300, width: 200, height: 200 });
    holder.getBoundingClientRect = () => ({ left: 400, top: 250, width: 100, height: 80 });

    const view = new GameView(dom.window.document);
    view.enterHome({ coin_balance: 1, pending_coins: 1 });

    const coin = dom.window.document.querySelector("[data-flying-coin]");
    expect(coin.style.left).toBe("171px");
    expect(coin.style.top).toBe("171px");
    expect(coin.style.getPropertyValue("--coin-dx")).toBe("150px");
    expect(coin.style.getPropertyValue("--coin-dy")).toBe("-110px");
  });

  it("finishes immediately for reduced motion and preserves an uncapped accessible value", () => {
    dom = createCoinDocument();
    dom.window.matchMedia = () => ({ matches: true });
    const view = new GameView(dom.window.document);
    let consumed = 0;

    view.enterHome({ coin_balance: 10023, pending_coins: 3 }, () => { consumed += 1; });

    expect(dom.window.document.querySelectorAll("[data-flying-coin]")).toHaveLength(0);
    expect(consumed).toBe(1);
    expect(dom.window.document.querySelector("#coin-amount").textContent).toBe("9999");
    expect(dom.window.document.querySelector("#coin-holder").getAttribute("aria-label"))
      .toBe("Coin balance: 10023");
  });

  it("makes interruption idempotent", () => {
    dom = createCoinDocument();
    const view = new GameView(dom.window.document);
    let consumed = 0;
    view.enterHome({ coin_balance: 3, pending_coins: 3 }, () => { consumed += 1; });

    view.finishCoinPresentation();
    view.finishCoinPresentation();
    vi.advanceTimersByTime(2000);

    expect(consumed).toBe(1);
    expect(dom.window.document.querySelectorAll("[data-flying-coin]")).toHaveLength(0);
  });
});

describe("match-win award eligibility", () => {
  it("awards exactly once when X reaches the third match point", () => {
    const store = storage();
    globalThis.localStorage = store;
    const view = new ControllerViewStub();
    const controller = new GameController(new GameModel(), view);
    controller.matchScore = { X: 2, O: 0 };

    controller.recordResult({ winner: "X", draw: false });
    controller.recordResult({ winner: "X", draw: false });

    const saved = JSON.parse(store.getItem(PLAYER_STORAGE_KEY));
    expect(saved).toMatchObject({ coin_balance: 3, pending_coins: 3, wins: 1 });
  });
});
