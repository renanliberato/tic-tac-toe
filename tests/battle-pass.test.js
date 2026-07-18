import { beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import {
  BATTLE_PASS_MILESTONES,
  BATTLE_PASS_MILESTONE_COUNT,
  claimBattlePassMilestone,
  getBattlePassCycle,
  getBattlePassReward,
  normalizeBattlePass
} from "../public/js/battle-pass.js";
import {
  PLAYER_STORAGE_KEY,
  awardPlayerBattlePassPoint,
  claimPlayerBattlePassMilestone,
  getOrCreatePlayer
} from "../public/js/player.js";
import { GameController } from "../public/js/controller.js";
import { GameModel } from "../public/js/model.js";
import { GameView } from "../public/js/view.js";

const JULY_BEFORE_RESET = Date.parse("2026-07-04T23:59:59.999Z");
const JULY_RESET = Date.parse("2026-07-05T00:00:00.000Z");

function readFileSyncForBattlePass() {
  return readFileSync("public/index.html", "utf8");
}

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

describe("monthly battle pass rules", () => {
  it("starts on the first Sunday and rolls to the next cycle at midnight", () => {
    expect(getBattlePassCycle(JULY_BEFORE_RESET).key).toBe("2026-06");
    expect(getBattlePassCycle(JULY_RESET).key).toBe("2026-07");
    expect(getBattlePassCycle(JULY_RESET).start).toBe(JULY_RESET);
  });

  it("creates 100 point milestones with the requested reward tiers", () => {
    expect(BATTLE_PASS_MILESTONES).toHaveLength(BATTLE_PASS_MILESTONE_COUNT);
    expect(getBattlePassReward(1)).toBe(1);
    expect(getBattlePassReward(5)).toBe(5);
    expect(getBattlePassReward(10)).toBe(10);
    expect(getBattlePassReward(15)).toBe(5);
    expect(getBattlePassReward(100)).toBe(10);
  });

  it("resets points and claims when a stored profile crosses into a new cycle", () => {
    const old = {
      battle_pass_cycle: "2026-06",
      battle_pass_points: 42,
      battle_pass_claimed: [1, 5, 42]
    };
    expect(normalizeBattlePass(old, JULY_RESET)).toEqual({
      battle_pass_cycle: "2026-07",
      battle_pass_points: 0,
      battle_pass_claimed: []
    });
  });

  it("awards one point, caps at 100, and only pays reached milestones once", () => {
    const player = {
      player_id: "player",
      battle_pass_cycle: "2026-07",
      battle_pass_points: 4,
      battle_pass_claimed: [],
      coin_balance: 0,
      pending_coins: 0
    };
    const reached = awardPlayerBattlePassPoint(player, JULY_RESET, null);
    expect(reached.battle_pass_points).toBe(5);

    const firstClaim = claimBattlePassMilestone(reached, 5, JULY_RESET);
    expect(firstClaim.status).toBe("claimed");
    expect(firstClaim.player.coin_balance).toBe(5);
    expect(firstClaim.player.battle_pass_claimed).toEqual([5]);
    expect(claimBattlePassMilestone(firstClaim.player, 5, JULY_RESET).player.coin_balance)
      .toBe(5);

    const capped = Array.from({ length: 101 }, () => null).reduce(
      (current) => awardPlayerBattlePassPoint(current, JULY_RESET),
      reached
    );
    expect(capped.battle_pass_points).toBe(100);
  });

  it("awards one point when the controller records a decisive local match win", () => {
    const storage = createStorage();
    const previousStorage = globalThis.localStorage;
    globalThis.localStorage = storage;
    const triggeredMilestones = [];
    const view = {
      cells: Array(9).fill(null),
      onStart() {},
      onCell() {},
      onContinue() {},
      bindDialogGuards() {},
      render() {},
      renderBattlePass() {},
      showBattlePass() {},
      triggerBattlePassVfx(milestone) { triggeredMilestones.push(milestone); },
      closeResultDialog() {},
      resetFeedback() {}
    };
    const timer = { now: () => JULY_RESET, setTimeout() {}, clearTimeout() {} };
    try {
      const controller = new GameController(new GameModel(), view, timer);
      controller.matchScore = { X: 2, O: 0 };

      controller.recordResult({ winner: "X", draw: false });
      controller.recordResult({ winner: "X", draw: false });

      expect(controller.player.battle_pass_points).toBe(1);
      expect(JSON.parse(storage.getItem(PLAYER_STORAGE_KEY)).battle_pass_points).toBe(1);
      expect(controller.pendingBattlePassVfx).toBe(1);

      controller.showBattlePass();
      controller.showBattlePass();
      expect(triggeredMilestones).toEqual([1]);
    } finally {
      globalThis.localStorage = previousStorage;
    }
  });

  it("triggers claim VFX only for a newly claimed milestone", () => {
    const storage = createStorage();
    const previousStorage = globalThis.localStorage;
    globalThis.localStorage = storage;
    const triggeredMilestones = [];
    const view = {
      cells: Array(9).fill(null),
      onStart() {},
      onCell() {},
      onContinue() {},
      bindDialogGuards() {},
      render() {},
      renderBattlePass() {},
      triggerBattlePassVfx(milestone) { triggeredMilestones.push(milestone); },
      closeResultDialog() {},
      resetFeedback() {}
    };
    const timer = { now: () => JULY_RESET, setTimeout() {}, clearTimeout() {} };
    try {
      const controller = new GameController(new GameModel(), view, timer);
      controller.player = {
        ...controller.player,
        battle_pass_cycle: "2026-07",
        battle_pass_points: 1,
        battle_pass_claimed: [],
        coin_balance: 0,
        pending_coins: 0
      };

      controller.claimBattlePass(1);
      controller.claimBattlePass(1);

      expect(triggeredMilestones).toEqual([1]);
    } finally {
      globalThis.localStorage = previousStorage;
    }
  });

  it("persists battle-pass progress and gold in the existing player profile", () => {
    const storage = createStorage();
    const player = getOrCreatePlayer(storage, JULY_RESET);
    const point = awardPlayerBattlePassPoint(player, JULY_RESET, storage);
    const result = claimPlayerBattlePassMilestone(point, 1, storage, JULY_RESET);

    expect(result.status).toBe("claimed");
    expect(result.player.coin_balance).toBe(1);
    expect(JSON.parse(storage.getItem(PLAYER_STORAGE_KEY))).toMatchObject({
      battle_pass_cycle: "2026-07",
      battle_pass_points: 1,
      battle_pass_claimed: [1],
      coin_balance: 1,
      pending_coins: 1
    });
  });
});

describe("battle pass screen", () => {
  let dom;

  beforeEach(() => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "http://localhost/"
    });
  });

  it("renders the progress rail, deterministic target state, decorative coins, and completion copy", () => {
    const html = readFileSyncForBattlePass();
    dom.window.document.documentElement.innerHTML = html
      .match(/<body>([\s\S]*)<\/body>/)[1];
    const view = new GameView(dom.window.document, () => JULY_RESET);
    view.renderBattlePass({
      battle_pass_points: 3,
      battle_pass_claimed: [1, 2, 3]
    }, JULY_RESET);

    expect(dom.window.document.querySelector("[data-battle-pass-progress]").textContent)
      .toBe("3 / 100 points");
    expect(dom.window.document.querySelector("[data-battle-pass-percent]").textContent).toBe("3%");
    expect(dom.window.document.querySelector("[data-battle-pass-target-text]").textContent)
      .toBe("1 points to milestone 4");
    expect(dom.window.document.querySelector("[data-battle-pass-target]").dataset.battlePassMilestone)
      .toBe("4");
    expect(dom.window.document.querySelectorAll("[data-battle-pass-rail-node]")).toHaveLength(100);
    expect(dom.window.document.querySelectorAll("[data-battle-pass-milestone]")).toHaveLength(100);
    expect(dom.window.document.querySelectorAll(".battle-pass-milestone__coin[aria-hidden=\"true\"]"))
      .toHaveLength(100);

    view.renderBattlePass({ battle_pass_points: 100, battle_pass_claimed: [] }, JULY_RESET);
    expect(dom.window.document.querySelector("[data-battle-pass-complete]").hidden).toBe(false);
    expect(dom.window.document.querySelector("[data-battle-pass-target]")).toBeNull();
  });

  it("centers the current target and disables smooth scrolling for reduced motion", () => {
    const html = readFileSyncForBattlePass();
    dom.window.document.documentElement.innerHTML = html
      .match(/<body>([\s\S]*)<\/body>/)[1];
    const view = new GameView(dom.window.document, () => JULY_RESET);
    const list = dom.window.document.querySelector("#battle-pass-list");
    const targetPlayer = { battle_pass_points: 3, battle_pass_claimed: [1, 2, 3] };
    const scrolls = [];
    list.getBoundingClientRect = () => ({ top: 100, height: 500, bottom: 600 });
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 500 });
    list.scrollTo = (options) => scrolls.push(options);
    view.renderBattlePass(targetPlayer, JULY_RESET);
    const target = list.querySelector("[data-battle-pass-target]");
    target.getBoundingClientRect = () => ({ top: 850, height: 80, bottom: 930 });
    Object.defineProperty(target, "offsetHeight", { configurable: true, value: 80 });
    view.scrollBattlePassToTarget();

    expect(scrolls).toEqual([{ top: 540, behavior: "smooth" }]);

    dom.window.matchMedia = () => ({ matches: true });
    view.scrollBattlePassToTarget();
    expect(scrolls.at(-1)).toEqual({ top: 540, behavior: "auto" });
  });

  it("creates and cleans up only localized claim VFX", () => {
    const html = readFileSyncForBattlePass();
    dom.window.document.documentElement.innerHTML = html
      .match(/<body>([\s\S]*)<\/body>/)[1];
    const view = new GameView(dom.window.document, () => JULY_RESET);
    view.renderBattlePass({ battle_pass_points: 1, battle_pass_claimed: [] }, JULY_RESET);
    vi.useFakeTimers();
    try {
      view.triggerBattlePassVfx(1);
      expect(dom.window.document.querySelectorAll("[data-battle-pass-particle]")).toHaveLength(8);
      expect(dom.window.document.querySelector("[data-battle-pass-rail-node=\"1\"]")
        .classList.contains("battle-pass-rail__node--flare")).toBe(true);
      vi.advanceTimersByTime(620);
      expect(dom.window.document.querySelectorAll("[data-battle-pass-particle]")).toHaveLength(0);

      dom.window.matchMedia = () => ({ matches: true });
      view.triggerBattlePassVfx(1);
      expect(dom.window.document.querySelectorAll("[data-battle-pass-particle]")).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows 100 milestones, makes reached rewards claimable, and returns home", async () => {
    const html = await import("node:fs").then(({ readFileSync }) =>
      readFileSync("public/index.html", "utf8"));
    dom.window.document.documentElement.innerHTML = html
      .match(/<body>([\s\S]*)<\/body>/)[1];
    const view = new GameView(dom.window.document, () => JULY_RESET);
    const timer = {
      now: () => JULY_RESET,
      setTimeout: () => 1,
      clearTimeout() {}
    };
    const controller = new GameController(new GameModel(), view, timer);

    controller.player = {
      ...controller.player,
      battle_pass_cycle: "2026-07",
      battle_pass_points: 2,
      battle_pass_claimed: [],
      coin_balance: 0,
      pending_coins: 0
    };
    controller.showBattlePass();

    expect(dom.window.document.querySelectorAll("[data-battle-pass-milestone]")).toHaveLength(100);
    expect(dom.window.document.querySelector("[data-battle-pass-milestone=\"1\"]").disabled).toBe(false);
    expect(dom.window.document.querySelector("[data-battle-pass-milestone=\"3\"]").disabled).toBe(true);

    dom.window.document.querySelector("[data-battle-pass-milestone=\"1\"]").click();
    expect(controller.player.battle_pass_claimed).toEqual([1]);
    expect(controller.player.coin_balance).toBe(1);

    dom.window.document.querySelector("#battle-pass-back").click();
    expect(dom.window.document.querySelector("#home-screen").hidden).toBe(false);
    expect(dom.window.document.activeElement.id).toBe("open-battle-pass");
    dom.window.close();
  });
});
