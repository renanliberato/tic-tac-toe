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

  it("places the floating row below the leaderboard border", () => {
    const styles = readFileSync(new URL("../public/css/styles.css", import.meta.url), "utf8");
    expect(styles).toMatch(/\.game \.leaderboard-floating \{[\s\S]*?bottom: 16px;/);
  });

  it("centers and focuses the real local row with reduced-motion behavior", () => {
    const dom = createDom();
    dom.window.matchMedia = () => ({ matches: true });
    const view = new GameView(dom.window.document);
    view.showLeaderboard(player, LEADERBOARD_EPOCH + 6.9 * 86_400_000);
    const list = dom.window.document.querySelector("#leaderboard-list");
    const row = dom.window.document.querySelector("#leaderboard-local-row");
    const floating = dom.window.document.querySelector("#floating-local-row");
    const scrollTo = vi.fn(({ top }) => { list.scrollTop = top; });
    list.scrollTo = scrollTo;
    list.getBoundingClientRect = () => ({ top: 100, height: 400, bottom: 500 });
    row.getBoundingClientRect = () => ({ top: 680, height: 80, bottom: 760 });
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(row, "offsetHeight", { configurable: true, value: 80 });
    list.scrollTop = 40;
    row.scrollIntoView = vi.fn();
    const focus = vi.spyOn(row, "focus");
    dom.window.document.documentElement.scrollTop = 37;
    const pageScrollTop = dom.window.document.documentElement.scrollTop;
    const pageScroll = vi.spyOn(dom.window, "scrollTo");

    floating.click();

    expect(scrollTo).toHaveBeenCalledWith({ top: 460, behavior: "auto" });
    expect(row.scrollIntoView).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(dom.window.document.activeElement).toBe(row);
    expect(dom.window.document.documentElement.scrollTop).toBe(pageScrollTop);
    expect(pageScroll).not.toHaveBeenCalled();
    view.stopLeaderboard();
  });

  it("requests smooth scrolling for normal-motion activation", () => {
    const dom = createDom();
    dom.window.matchMedia = () => ({ matches: false });
    const view = new GameView(dom.window.document);
    view.showLeaderboard(player, LEADERBOARD_EPOCH + 6.9 * 86_400_000);
    const list = dom.window.document.querySelector("#leaderboard-list");
    const row = dom.window.document.querySelector("#leaderboard-local-row");
    const scrollTo = vi.fn();
    list.scrollTo = scrollTo;
    list.getBoundingClientRect = () => ({ top: 100, height: 400, bottom: 500 });
    row.getBoundingClientRect = () => ({ top: 680, height: 80, bottom: 760 });
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(row, "offsetHeight", { configurable: true, value: 80 });

    dom.window.document.querySelector("#floating-local-row").click();

    expect(scrollTo).toHaveBeenCalledWith({ top: 420, behavior: "smooth" });
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

  it("preserves leaderboard refresh and listener identities after game feedback", async () => {
    const dom = createDom();
    let now = LEADERBOARD_EPOCH + 1;
    const view = new GameView(dom.window.document, () => now);
    const originalListeners = {
      scroll: view.handleLeaderboardScroll,
      visibility: view.handleVisibilityChange,
      storage: view.handleStorageChange,
      floating: view.handleFloatingActivation
    };
    const listRemoveSpy = vi.spyOn(view.leaderboardList, "removeEventListener");
    const floatingRemoveSpy = vi.spyOn(view.floatingLocalRow, "removeEventListener");
    const documentRemoveSpy = vi.spyOn(dom.window.document, "removeEventListener");
    const windowRemoveSpy = vi.spyOn(dom.window, "removeEventListener");
    const setIntervalSpy = vi.spyOn(dom.window, "setInterval");
    const storagePlayer = { ...player, leaderboard_score: 7 };
    const nextCyclePlayer = { ...player, leaderboard_cycle: 1, leaderboard_score: 0 };
    const refresh = vi.fn()
      .mockReturnValueOnce(storagePlayer)
      .mockReturnValueOnce(nextCyclePlayer);
    view.onLeaderboardRefresh(refresh);

    view.resetFeedback();
    const animation = view.animateWinningLine([0, 1, 2]);
    view.winningLineElement.dispatchEvent(new dom.window.Event("animationend"));
    await animation;

    expect(view.handleLeaderboardScroll).toBe(originalListeners.scroll);
    expect(view.handleVisibilityChange).toBe(originalListeners.visibility);
    expect(view.handleStorageChange).toBe(originalListeners.storage);
    expect(view.handleFloatingActivation).toBe(originalListeners.floating);

    view.showLeaderboard(player, now);
    dom.window.dispatchEvent(new dom.window.StorageEvent("storage", {
      key: "tic-tac-toe-player"
    }));
    expect(refresh).toHaveBeenLastCalledWith(true);
    expect(dom.window.document.querySelector(
      "#leaderboard-local-row .leaderboard-row__score"
    ).textContent).toBe("7");

    now = LEADERBOARD_EPOCH + 7 * 86_400_000 + 1;
    setIntervalSpy.mock.calls[0][0]();
    expect(refresh).toHaveBeenLastCalledWith(false);
    expect(dom.window.document.querySelector(
      "#leaderboard-local-row .leaderboard-row__score"
    ).textContent).toBe("0");

    view.stopLeaderboard();
    expect(listRemoveSpy).toHaveBeenCalledWith("scroll", originalListeners.scroll);
    expect(floatingRemoveSpy).toHaveBeenCalledWith("click", originalListeners.floating);
    expect(documentRemoveSpy).toHaveBeenCalledWith(
      "visibilitychange", originalListeners.visibility
    );
    expect(windowRemoveSpy).toHaveBeenCalledWith("storage", originalListeners.storage);
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
