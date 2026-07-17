import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { PLAYER_STORAGE_KEY } from "../public/js/player.js";

let dom;
let random;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  dom = new JSDOM(readFileSync("public/index.html", "utf8"), { url: "http://localhost/" });
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  random = vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  random.mockRestore();
  vi.useRealTimers();
  dom.window.close();
  delete globalThis.document;
  delete globalThis.localStorage;
});

async function load(name) {
  if (name === "immediate") await import("../public/js/main.js?ai-immediate");
  else if (name === "locking") await import("../public/js/main.js?ai-locking");
  else if (name === "last-free") await import("../public/js/main.js?ai-last-free");
  else await import("../public/js/main.js?ai-stale");
}

function cell(index) {
  return document.querySelector(`[data-cell="${index}"]`);
}

describe("game entry point", () => {
  it("starts an empty Computer match immediately with the human as X", async () => {
    await load("immediate");
    document.querySelector("#start-game").click();

    expect(document.querySelector("#home-screen").hidden).toBe(true);
    expect(document.querySelector("#game-screen").hidden).toBe(false);
    expect(document.querySelector("#matchmaking-dialog")).toBeNull();
    expect(document.querySelector("#opponent-name").textContent).toBe("Computer");
    expect(document.querySelector("[data-player=opponent] .player-role").textContent).toBe("AI Opponent");
    expect(document.querySelector("#turn-announcement").textContent).toBe("Your turn");
    expect([...document.querySelectorAll("[data-cell]")].every((item) => !item.disabled)).toBe(true);
    expect(document.activeElement).toBe(cell(0));
  });

  it("locks rapid clicks while Computer is thinking and records only X statistics", async () => {
    await load("locking");
    document.querySelector("#start-game").click();
    cell(4).click();
    cell(5).click();

    expect(cell(4).textContent).toBe("X");
    expect(cell(5).textContent).toBe("");
    expect([...document.querySelectorAll("[data-cell]")].every((item) => item.disabled)).toBe(true);
    expect(document.querySelector("#turn-announcement").textContent).toBe("Computer is thinking…");
    expect(document.querySelector("[data-player=opponent]").classList.contains("player-card--active")).toBe(true);

    vi.advanceTimersByTime(499);
    expect(cell(0).textContent).toBe("");
    vi.advanceTimersByTime(1);
    expect(cell(0).textContent).toBe("O");
    expect(document.querySelector("#turn-announcement").textContent).toBe("Your turn");
    expect(JSON.parse(globalThis.localStorage.getItem(PLAYER_STORAGE_KEY))).toMatchObject({
      games_played: 1,
      moves_played: 1,
      last_move: { cell: 4, mark: "X" }
    });
  });

  it("uses randomness over the free-cell list without an opening preference", async () => {
    random.mockReturnValue(.999999);
    await load("last-free");
    document.querySelector("#start-game").click();
    cell(4).click();
    vi.advanceTimersByTime(500);
    expect(cell(8).textContent).toBe("O");
    expect(cell(0).textContent).toBe("");
  });

  it("does not let a stale AI timeout modify a board after navigation", async () => {
    await load("stale");
    document.querySelector("#start-game").click();
    cell(4).click();
    // Continue is the normal home path; invoke a terminal-independent browser
    // navigation equivalent through a fresh immediate start, which cancels AI.
    document.querySelector("#start-game").click();
    vi.advanceTimersByTime(500);
    expect([...document.querySelectorAll("[data-cell]")].every((item) => item.textContent === "")).toBe(true);
  });
});
