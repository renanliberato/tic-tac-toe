import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { GameView } from "../public/js/view.js";
import { GameController } from "../public/js/controller.js";
import { GameModel } from "../public/js/model.js";
import { LEADERBOARD_EPOCH } from "../public/js/leaderboard.js";

function createDom() {
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  return new JSDOM(html, { url: "https://example.test/", pretendToBeVisual: true });
}

const player = {
  player_name: "Ace", leaderboard_cycle: 0, leaderboard_score: 0
};

afterEach(() => {
  delete globalThis.localStorage;
});

describe("leaderboard view and navigation", () => {
  it("has an accessible trophy and renders the exact pre-launch state", () => {
    const dom = createDom();
    const view = new GameView(dom.window.document);
    const entry = dom.window.document.querySelector("#open-leaderboard");
    expect(entry.tagName).toBe("BUTTON");
    expect(entry.getAttribute("aria-label")).toBe("Open leaderboard");

    view.showLeaderboard(player, LEADERBOARD_EPOCH - 1);
    expect(dom.window.document.querySelector("#home-screen").hidden).toBe(true);
    expect(dom.window.document.querySelector("#leaderboard-screen").hidden).toBe(false);
    expect(dom.window.document.querySelector("#leaderboard-message").textContent)
      .toBe("Starts Jan 4, 2026");
    const rows = dom.window.document.querySelectorAll("#leaderboard-list .leaderboard-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("—Ace (You)0");
    expect(dom.window.document.activeElement.id).toBe("leaderboard-back");
    view.stopLeaderboard();
  });

  it("renders every eligible row and starts every opening at the top", () => {
    const dom = createDom();
    const view = new GameView(dom.window.document);
    const list = dom.window.document.querySelector("#leaderboard-list");
    view.showLeaderboard(player, LEADERBOARD_EPOCH + 6.9 * 86_400_000);
    expect(list.children.length).toBeGreaterThan(900);
    expect(dom.window.document.querySelector("#leaderboard-local-row").textContent)
      .toContain("Ace (You)");
    list.scrollTop = 500;
    view.stopLeaderboard();
    view.showLeaderboard(player, LEADERBOARD_EPOCH + 6.9 * 86_400_000);
    expect(list.scrollTop).toBe(0);
    view.stopLeaderboard();
  });

  it("jumps and focuses the real local row with reduced-motion behavior", () => {
    const dom = createDom();
    dom.window.matchMedia = () => ({ matches: true });
    const view = new GameView(dom.window.document);
    view.showLeaderboard(player, LEADERBOARD_EPOCH + 6.9 * 86_400_000);
    const row = dom.window.document.querySelector("#leaderboard-local-row");
    row.scrollIntoView = vi.fn();
    dom.window.document.querySelector("#floating-local-row").click();
    expect(row.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "auto" });
    expect(dom.window.document.activeElement).toBe(row);
    view.stopLeaderboard();
  });

  it("refreshes and cleans up interval, visibility, storage, scroll, and observer state", () => {
    const dom = createDom();
    const setIntervalSpy = vi.spyOn(dom.window, "setInterval");
    const clearIntervalSpy = vi.spyOn(dom.window, "clearInterval");
    const disconnect = vi.fn();
    dom.window.IntersectionObserver = class {
      constructor(callback) { this.callback = callback; }
      observe() {}
      disconnect() { disconnect(); }
    };
    const view = new GameView(dom.window.document);
    const refresh = vi.fn(() => player);
    view.onLeaderboardRefresh(refresh);
    view.showLeaderboard(player, LEADERBOARD_EPOCH + 1);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    dom.window.dispatchEvent(new dom.window.StorageEvent("storage", { key: "tic-tac-toe-player" }));
    expect(refresh).toHaveBeenCalledWith(true);
    view.stopLeaderboard();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalled();
    view.showLeaderboard(player, LEADERBOARD_EPOCH + 1);
    expect(setIntervalSpy).toHaveBeenCalledTimes(2);
    view.stopLeaderboard();
  });

  it("navigates Home to Leaderboard to Home without URL changes and restores trophy focus", () => {
    const dom = createDom();
    globalThis.localStorage = dom.window.localStorage;
    const view = new GameView(dom.window.document);
    const timer = { now: () => LEADERBOARD_EPOCH + 1, setTimeout: vi.fn(), clearTimeout: vi.fn() };
    new GameController(new GameModel(), view, timer);
    const originalUrl = dom.window.location.href;
    dom.window.document.querySelector("#open-leaderboard").click();
    expect(dom.window.document.querySelector("#leaderboard-screen").hidden).toBe(false);
    dom.window.document.querySelector("#leaderboard-back").click();
    expect(dom.window.document.querySelector("#home-screen").hidden).toBe(false);
    expect(dom.window.document.activeElement.id).toBe("open-leaderboard");
    expect(dom.window.location.href).toBe(originalUrl);
  });
});
