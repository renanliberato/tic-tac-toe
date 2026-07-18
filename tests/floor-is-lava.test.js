import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import {
  FLOOR_IS_LAVA_STAGES,
  createFloorIsLavaField,
  getFloorIsLavaPositions,
  getFloorIsLavaWindow,
  getFloorIsLavaPayout
} from "../public/js/floor-is-lava.js";
import { PLAYER_STORAGE_KEY, commitFloorIsLavaResult, getOrCreatePlayer, reloadPlayer } from "../public/js/player.js";
import { GameController } from "../public/js/controller.js";
import { GameModel } from "../public/js/model.js";
import { GameView } from "../public/js/view.js";

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values };
}
const at = (hour, minute = 0) => new Date(2027, 4, 12, hour, minute);

describe("Floor Is Lava daily domain", () => {
  it("uses a shared deterministic date-only twelve-climber field", () => {
    const first = createFloorIsLavaField(at(7));
    const reload = createFloorIsLavaField(at(17, 59));
    const tomorrow = createFloorIsLavaField(new Date(2027, 4, 13, 7));
    expect(first).toEqual(reload);
    expect(first.opponents).toHaveLength(12);
    expect(first.finishers).toHaveLength(first.finisherCount);
    expect(first.finisherCount).toBeGreaterThanOrEqual(5);
    expect(first.finisherCount).toBeLessThanOrEqual(10);
    expect(first.opponents.slice(0, 6).every((entry) => entry.name && entry.portrait.includes("<svg"))).toBe(true);
    expect(tomorrow.seed).not.toBe(first.seed);
  });

  it("models local opening boundaries and stepped finisher destinations", () => {
    expect(getFloorIsLavaWindow(at(5, 59)).phase).toBe("before");
    expect(getFloorIsLavaWindow(at(6)).isOpen).toBe(true);
    expect(getFloorIsLavaWindow(at(17, 59)).phase).toBe("open");
    expect(getFloorIsLavaWindow(at(18)).phase).toBe("closed");
    const positions = getFloorIsLavaPositions(at(7), at(18));
    expect(positions.filter((entry) => entry.finisher).every((entry) => entry.level === FLOOR_IS_LAVA_STAGES)).toBe(true);
    expect(positions.filter((entry) => !entry.finisher).every((entry) => entry.level < FLOOR_IS_LAVA_STAGES)).toBe(true);
  });

  it("commits a stage once, keeps stale tabs reward-free, and permits a pre-close finish", () => {
    const store = storage();
    let player = getOrCreatePlayer(store, at(17, 59));
    const expected = { date: player.floor_is_lava.date, revision: 0, stage: 1, started_at: at(17, 59).getTime() };
    const committed = commitFloorIsLavaResult(player, expected, "win", store, at(18, 1), { rounds: 3, wins: 3 });
    expect(committed.accepted).toBe(true);
    expect(committed.player.floor_is_lava).toMatchObject({ wins: 1, status: "closed", pending_progress: false });
    expect(committed.player.games_played).toBe(3);
    const stale = commitFloorIsLavaResult(player, expected, "win", store, at(18, 1), { rounds: 3, wins: 3 });
    expect(stale.accepted).toBe(false);
    expect(stale.player.games_played).toBe(3);
  });

  it("pays the exact shared pot once on the sixth accepted win", () => {
    const store = storage();
    let player = getOrCreatePlayer(store, at(8));
    for (let stage = 1; stage <= 6; stage += 1) {
      const event = player.floor_is_lava;
      const result = commitFloorIsLavaResult(player, {
        date: event.date, revision: event.revision, stage, started_at: at(8).getTime()
      }, "win", store, at(8), { rounds: 3, wins: 3 });
      expect(result.accepted).toBe(true);
      player = result.player;
    }
    const payout = getFloorIsLavaPayout(at(8));
    expect(player.floor_is_lava).toMatchObject({ status: "completed", wins: 6, payout });
    expect(player.coin_balance).toBe(3 + 3 + 4 + 4 + 4 + 4 + payout);
    const duplicate = commitFloorIsLavaResult(player, { date: player.floor_is_lava.date, revision: player.floor_is_lava.revision, stage: 7, started_at: at(8).getTime() }, "win", store, at(8));
    expect(duplicate.accepted).toBe(false);
  });

  it("resets the attempt on a later local day", () => {
    const store = storage();
    const player = getOrCreatePlayer(store, at(8));
    const changed = reloadPlayer(store, new Date(2027, 4, 13, 8));
    expect(changed.floor_is_lava.date).not.toBe(player.floor_is_lava.date);
    expect(changed.floor_is_lava.wins).toBe(0);
    expect(JSON.parse(store.getItem(PLAYER_STORAGE_KEY)).floor_is_lava.date).toBe(changed.floor_is_lava.date);
  });
});

class FloorIsLavaViewStub {
  constructor() {
    this.cells = Array(9).fill(null);
    this.rendered = [];
    this.floorOpenHandler = null;
    this.floorStartHandler = null;
    this.floorIsLavaOpen = false;
  }

  onStart() {}
  onCell() {}
  onContinue() {}
  bindDialogGuards() {}
  render(...args) { this.rendered.push(args); }
  onFloorIsLavaOpen(handler) { this.floorOpenHandler = handler; }
  onFloorIsLavaStart(handler) { this.floorStartHandler = handler; }
  showFloorIsLava() { this.floorIsLavaOpen = true; }
  renderFloorIsLava(...args) { this.floorIsLava = args; }
  showGame() { this.floorIsLavaOpen = false; this.gameVisible = true; }
  focusFirstCell() {}
  closeResultDialog() {}
  resetFeedback() {}
  finishCoinPresentation() {}
  replayMove() {}
}

describe("Floor Is Lava controller and view", () => {
  it("starts an open event as an isolated stage-one match with the daily opponent", () => {
    const timestamp = at(8).getTime();
    const timers = {
      now: () => timestamp,
      setInterval: () => 1,
      clearInterval() {},
      setTimeout: () => 2,
      clearTimeout() {}
    };
    const view = new FloorIsLavaViewStub();
    const controller = new GameController(new GameModel(), view, timers, () => 0);

    view.floorOpenHandler();
    expect(view.floorIsLava[0]).toMatchObject({ status: "active", wins: 0 });
    expect(view.floorIsLavaOpen).toBe(true);

    view.floorStartHandler();
    const firstOpponent = createFloorIsLavaField(at(8)).opponents[0];
    expect(view.gameVisible).toBe(true);
    expect(controller.eventMatch).toMatchObject({ stage: 1, started_at: timestamp });
    expect(controller.opponent).toMatchObject({
      opponent_id: firstOpponent.id,
      opponent_name: firstOpponent.name,
      opponent_role: "Daily lava climber"
    });

    controller.play(0);
    expect(controller.eventRoundStats).toMatchObject({ games: 1, moves: 1, last_move: { cell: 0, mark: "X" } });
    expect(controller.player.moves_played).toBe(0);
  });

  it("persists every completed round when an event match ends", () => {
    const store = storage();
    const previousStorage = globalThis.localStorage;
    const timestamp = at(8).getTime();
    const timers = {
      now: () => timestamp,
      setInterval: () => 1,
      clearInterval() {},
      setTimeout: () => 2,
      clearTimeout() {}
    };
    globalThis.localStorage = store;

    try {
      const controller = new GameController(new GameModel(), new FloorIsLavaViewStub(), timers, () => 0);
      expect(controller.startFloorIsLavaMatch()).toBe(true);

      controller.recordResult({ winner: "X", draw: false });
      controller.startNextRound(controller.roundId);
      controller.recordResult({ winner: "X", draw: false });
      controller.startNextRound(controller.roundId);
      controller.recordResult({ winner: "X", draw: false });

      expect(controller.player.games_played).toBe(3);
      expect(JSON.parse(store.getItem(PLAYER_STORAGE_KEY)).games_played).toBe(3);
    } finally {
      if (previousStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = previousStorage;
    }
  });

  it("renders the active climb, local position, and next-stage action", () => {
    const dom = new JSDOM(`
      <main><section id="home-screen"></section><section id="game-screen"></section>
      <section id="floor-is-lava-screen"><h2 id="floor-is-lava-title" tabindex="-1"></h2>
      <p id="floor-is-lava-status"></p><p id="floor-is-lava-live"></p>
      <small id="floor-is-lava-winners"></small><div id="floor-is-lava-climb"></div>
      <button id="start-floor-is-lava"></button></section></main>
    `);
    const view = new GameView(dom.window.document, () => at(8));
    const event = { date: "2027-05-12", status: "active", wins: 1 };
    const field = createFloorIsLavaField(at(8));

    view.renderFloorIsLava(event, field, at(8));

    expect(dom.window.document.querySelectorAll("[data-lava-id]")).toHaveLength(13);
    expect(dom.window.document.querySelector("[data-lava-id=\"you\"]").getAttribute("aria-label")).toBe("You, island 1");
    expect(dom.window.document.querySelector("#floor-is-lava-winners").textContent)
      .toBe(`${field.finisherCount} climbers are sharing the summit`);
    const start = dom.window.document.querySelector("#start-floor-is-lava");
    expect(start.disabled).toBe(false);
    expect(start.hidden).toBe(false);
    expect(start.textContent).toBe(`Play ${field.opponents[1].name} · stage 2`);
  });
});
