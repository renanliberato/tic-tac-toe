import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import {
  claimDailyGift,
  DAILY_GIFT_REWARDS,
  getLocalDate,
  getOrCreatePlayer,
  PLAYER_STORAGE_KEY
} from "../public/js/player.js";
import { GameController } from "../public/js/controller.js";
import { GameModel } from "../public/js/model.js";
import { GameView } from "../public/js/view.js";

const ID = "123e4567-e89b-42d3-a456-426614174000";
function store() {
  const values = new Map();
  return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
}
function giftDom() {
  return new JSDOM("<main class=\"game\"><section id=\"home-screen\"><button id=\"daily-gifts-launcher\">gift</button></section><section id=\"game-screen\" hidden><p id=\"status\"></p><div class=\"board\"></div></section><dialog id=\"daily-gifts-dialog\"><div class=\"daily-gifts-content\"><h2>Daily Gifts</h2><div id=\"daily-gifts-grid\"></div><p id=\"daily-gifts-description\"></p><button id=\"daily-gifts-action\"></button></div></dialog></main>", { pretendToBeVisual: true });
}
afterEach(() => vi.useRealTimers());

describe("daily gift profile state", () => {
  it("migrates only gift state and uses the startup local date", () => {
    const storage = store();
    storage.setItem(PLAYER_STORAGE_KEY, JSON.stringify({ player_id: ID, wins: 8, coin_balance: 42, pending_coins: 3 }));
    const player = getOrCreatePlayer(storage, "2026-01-02");
    expect(player).toMatchObject({ player_id: ID, wins: 8, coin_balance: 42, pending_coins: 3 });
    expect(player.daily_gift).toMatchObject({ day: 1, claimed: false, eligible_date: "2026-01-02" });
  });

  it("advances once on a later login, never on equal/earlier dates, and does not skip", () => {
    const storage = store();
    let player = getOrCreatePlayer(storage, "2026-01-05");
    player = claimDailyGift(player, storage).player;
    expect(getOrCreatePlayer(storage, "2026-01-05").daily_gift.day).toBe(1);
    expect(getOrCreatePlayer(storage, "2026-01-01").daily_gift.day).toBe(1);
    player = getOrCreatePlayer(storage, "2026-02-20");
    expect(player.daily_gift).toMatchObject({ day: 2, claimed: false });
  });

  it("keeps an unclaimed offer but moves its login boundary forward", () => {
    const storage = store();
    let player = getOrCreatePlayer(storage, "2026-01-01");
    player = getOrCreatePlayer(storage, "2026-01-04");
    expect(player.daily_gift).toMatchObject({ day: 1, eligible_date: "2026-01-04" });
    player = claimDailyGift(player, storage).player;
    expect(getOrCreatePlayer(storage, "2026-01-04").daily_gift.day).toBe(1);
    expect(getOrCreatePlayer(storage, "2026-01-05").daily_gift.day).toBe(2);
  });

  it("pays the schedule, rejects stale duplicate claims, and repeats after day seven", () => {
    const storage = store();
    let player = getOrCreatePlayer(storage, "2026-03-01");
    const paid = [];
    for (let index = 0; index < 7; index += 1) {
      const stale = player;
      const result = claimDailyGift(player, storage);
      paid.push(result.amount);
      expect(claimDailyGift(stale, storage).claimed).toBe(false);
      player = index < 6 ? getOrCreatePlayer(storage, `2026-03-${String(index + 2).padStart(2, "0")}`) : result.player;
    }
    expect(paid).toEqual(DAILY_GIFT_REWARDS);
    player = getOrCreatePlayer(storage, "2026-03-08");
    expect(player.daily_gift).toMatchObject({ day: 1, claimed: false });
    expect(player.coin_balance).toBe(160);
  });

  it("prevents duplicate claims in memory when storage writes fail", () => {
    const legacy = JSON.stringify({ player_id: ID, coin_balance: 7 });
    const storage = {
      getItem: () => legacy,
      setItem: () => { throw new Error("full"); }
    };
    const player = getOrCreatePlayer(storage, "2026-04-10");
    const first = claimDailyGift(player, storage);
    const duplicate = claimDailyGift(player, storage);
    expect(first).toMatchObject({ claimed: true, amount: 10 });
    expect(first.player.coin_balance).toBe(17);
    expect(duplicate).toMatchObject({ claimed: false, amount: 0 });
    expect(duplicate.player.coin_balance).toBe(17);
  });

  it("formats dates using local calendar parts", () => {
    expect(getLocalDate(new Date(2026, 10, 9, 23, 59))).toBe("2026-11-09");
  });
});

describe("daily gift dialog", () => {
  it("renders 3/3/1 progress and claims an inside click only once", () => {
    const dom = giftDom();
    const view = new GameView(dom.window.document);
    const claim = vi.fn();
    view.openDailyGift({ day: 3, claimed: false }, { claim });
    const cells = [...view.dailyGiftGrid.children];
    expect(cells).toHaveLength(7);
    expect(cells[0].classList.contains("daily-gift-cell--claimed")).toBe(true);
    expect(cells[2].classList.contains("daily-gift-cell--current")).toBe(true);
    expect(cells[6].dataset.day).toBe("7");
    view.dailyGiftAction.click();
    view.dailyGiftAction.click();
    expect(claim).toHaveBeenCalledTimes(1);
    dom.window.close();
  });

  it("dismisses on Escape, restores focus, and closes read-only mode from inside", () => {
    const dom = giftDom();
    const view = new GameView(dom.window.document);
    const launcher = view.dailyGiftLauncher;
    launcher.focus();
    const dismiss = vi.fn();
    view.openDailyGift({ day: 1, claimed: false }, { dismiss }, launcher);
    view.dailyGiftDialog.dispatchEvent(new dom.window.Event("cancel", { cancelable: true }));
    expect(dismiss).toHaveBeenCalledOnce();
    expect(dom.window.document.activeElement).toBe(launcher);
    view.openDailyGift({ day: 1, claimed: true }, { dismiss }, launcher);
    expect(view.dailyGiftDescription.textContent).toBe("Come back tomorrow for your next gift.");
    view.dailyGiftGrid.firstElementChild.click();
    expect(dismiss).toHaveBeenCalledTimes(2);
    dom.window.close();
  });
});


describe("daily gift presentation ordering", () => {
  function playerWithPending(storage, pending = 3) {
    storage.setItem(PLAYER_STORAGE_KEY, JSON.stringify({
      player_id: ID,
      coin_balance: pending,
      pending_coins: pending,
      daily_gift: { day: 1, claimed: false, eligible_date: getLocalDate(), revision: 0 }
    }));
  }

  function controllerView() {
    return {
      cells: [],
      dailyGiftLauncher: {},
      presentations: [],
      onStart() {}, onCell() {}, onContinue() {}, onDailyGiftOpen() {},
      bindDialogGuards() {}, render() {}, renderCoinBalance() {},
      openDailyGift(gift, handlers) { this.gift = gift; this.giftHandlers = handlers; return true; },
      animateDailyGiftClaim() {}, closeDailyGift() {},
      enterHome(player, complete) { this.presentations.push({ amount: player.pending_coins, complete }); }
    };
  }

  it("combines startup pending coins with a claimed gift", () => {
    const storage = store();
    playerWithPending(storage);
    globalThis.localStorage = storage;
    const view = controllerView();
    const controller = new GameController(new GameModel(), view);

    view.giftHandlers.claim();

    expect(view.presentations.map(item => item.amount)).toEqual([13]);
    expect(controller.player).toMatchObject({ coin_balance: 13, pending_coins: 13 });
    view.presentations[0].complete();
    expect(controller.player.pending_coins).toBe(0);
    delete globalThis.localStorage;
  });

  it("presents a dismissed backlog before a later gift as separate entries", () => {
    const storage = store();
    playerWithPending(storage);
    globalThis.localStorage = storage;
    const view = controllerView();
    const controller = new GameController(new GameModel(), view);

    view.giftHandlers.dismiss();
    expect(view.presentations.map(item => item.amount)).toEqual([3]);
    controller.openDailyGift(view.dailyGiftLauncher);
    view.giftHandlers.claim();
    expect(view.presentations.map(item => item.amount)).toEqual([3]);

    view.presentations[0].complete();
    expect(view.presentations.map(item => item.amount)).toEqual([3, 10]);
    view.presentations[1].complete();
    expect(controller.player.pending_coins).toBe(0);
    expect(controller.scheduledPendingCoins).toBe(0);
    delete globalThis.localStorage;
  });

  it("adopts an external claim and closes a stale claimable dialog", () => {
    const storage = store();
    playerWithPending(storage, 0);
    globalThis.localStorage = storage;
    let storageListener;
    const view = {
      ...controllerView(),
      document: { defaultView: { addEventListener: (type, listener) => {
        if (type === "storage") storageListener = listener;
      } } },
      dailyGiftMode: "claimable",
      renderDailyGift: vi.fn(),
      renderCoinBalance: vi.fn(),
      closeDailyGift: vi.fn()
    };
    const controller = new GameController(new GameModel(), view);
    const external = {
      ...controller.player,
      coin_balance: 10,
      pending_coins: 10,
      daily_gift: { ...controller.player.daily_gift, claimed: true, revision: 1 }
    };
    storage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(external));

    storageListener({ key: PLAYER_STORAGE_KEY });

    expect(controller.player).toEqual(external);
    expect(view.renderDailyGift).toHaveBeenCalledWith(external.daily_gift);
    expect(view.renderCoinBalance).toHaveBeenCalledWith(10);
    expect(view.closeDailyGift).toHaveBeenCalledOnce();
    delete globalThis.localStorage;
  });

  it("presents pending coins added by a storage update during an active presentation", () => {
    const storage = store();
    playerWithPending(storage);
    globalThis.localStorage = storage;
    let storageListener;
    const view = {
      ...controllerView(),
      document: { defaultView: { addEventListener: (type, listener) => {
        if (type === "storage") storageListener = listener;
      } } }
    };
    const controller = new GameController(new GameModel(), view);

    view.giftHandlers.dismiss();
    const external = {
      ...controller.player,
      coin_balance: 13,
      pending_coins: 13,
      daily_gift: { ...controller.player.daily_gift, claimed: true, revision: 1 }
    };
    storage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(external));
    storageListener({ key: PLAYER_STORAGE_KEY });

    expect(view.presentations.map(item => item.amount)).toEqual([3]);
    view.presentations[0].complete();
    expect(view.presentations.map(item => item.amount)).toEqual([3, 10]);
    view.presentations[1].complete();
    expect(controller.player.pending_coins).toBe(0);
    expect(controller.scheduledPendingCoins).toBe(0);
    delete globalThis.localStorage;
  });

  it("does not schedule the same pending backlog twice", () => {
    const storage = store();
    playerWithPending(storage);
    globalThis.localStorage = storage;
    const view = controllerView();
    const controller = new GameController(new GameModel(), view);

    view.giftHandlers.dismiss();
    controller.enterHomePresentation();

    expect(view.presentations.map(item => item.amount)).toEqual([3]);
    delete globalThis.localStorage;
  });
});
