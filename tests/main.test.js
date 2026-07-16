import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";

const cellsMarkup = Array.from({ length: 9 }, (_, index) =>
  `<button data-cell="${index}" type="button"></button>`
).join("");

let dom;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  dom = new JSDOM(`
    <main>
      <section id="home-screen"><button id="start-game" type="button">Start game</button></section>
      <section id="game-screen" hidden>
        <p id="status"></p>
        <div>${cellsMarkup}</div>
      </section>
      <dialog id="matchmaking-dialog" aria-labelledby="matchmaking-title" aria-describedby="matchmaking-message">
        <h2 id="matchmaking-title">Finding an opponent</h2>
        <p id="matchmaking-message" role="status">Finding an opponent...</p>
      </dialog>
      <dialog id="result-dialog" aria-labelledby="result-message">
        <h2 id="result-message"></h2>
        <button id="continue" type="button">Continue</button>
      </dialog>
    </main>
  `);
  globalThis.document = dom.window.document;
});

afterEach(() => {
  vi.useRealTimers();
  dom.window.close();
  delete globalThis.document;
});

describe("game entry point", () => {
  it("keeps the home screen visible and board controls disabled initially", async () => {
    await import("../public/js/main.js?unit");

    expect(document.querySelector("#home-screen").hidden).toBe(false);
    expect(document.querySelector("#game-screen").hidden).toBe(true);
    expect([...document.querySelectorAll("[data-cell]")].every((cell) => cell.disabled)).toBe(true);
  });

  it("shows matchmaking before starting a fresh game", async () => {
    await import("../public/js/main.js?matchmaking");

    document.querySelector("#start-game").click();

    expect(document.querySelector("#matchmaking-dialog").open).toBe(true);
    expect(document.querySelector("#home-screen").hidden).toBe(true);
    expect(document.querySelector("#game-screen").hidden).toBe(true);
    expect([...document.querySelectorAll("[data-cell]")].every((cell) => cell.disabled)).toBe(true);

    vi.advanceTimersByTime(2999);
    expect(document.querySelector("#game-screen").hidden).toBe(true);

    vi.advanceTimersByTime(1);
    expect(document.querySelector("#matchmaking-dialog").open).toBe(false);
    expect(document.querySelector("#game-screen").hidden).toBe(false);
  });

  it("keeps matchmaking modal open on dismissal and ignores duplicate starts", async () => {
    await import("../public/js/main.js?matchmaking-guard");

    const start = document.querySelector("#start-game");
    const dialog = document.querySelector("#matchmaking-dialog");
    start.click();

    const cancelEvent = new dom.window.Event("cancel", { cancelable: true });
    expect(dialog.dispatchEvent(cancelEvent)).toBe(false);
    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(true);

    start.click();
    vi.advanceTimersByTime(2999);
    expect(document.querySelector("#game-screen").hidden).toBe(true);

    vi.advanceTimersByTime(1);
    expect(document.querySelector("#game-screen").hidden).toBe(false);
  });

  it("starts a fresh game when matchmaking completes", async () => {
    await import("../public/js/main.js?unit");

    document.querySelector("#start-game").click();
    vi.advanceTimersByTime(3000);

    expect(document.querySelector("#home-screen").hidden).toBe(true);
    expect(document.querySelector("#game-screen").hidden).toBe(false);
    expect(document.querySelector("#status").textContent).toBe("Player X's turn");
    expect([...document.querySelectorAll("[data-cell]")].every((cell) => !cell.disabled)).toBe(true);
    expect(document.activeElement).toBe(document.querySelector("[data-cell=\"0\"]"));
  });

  it("shows a draw result and keeps the dialog open when dismissal is attempted", async () => {
    await import("../public/js/main.js?draw-dialog");

    document.querySelector("#start-game").click();
    vi.advanceTimersByTime(3000);
    for (const index of [0, 1, 2, 4, 3, 5, 7, 6, 8]) {
      document.querySelector(`[data-cell="${index}"]`).click();
    }

    const dialog = document.querySelector("#result-dialog");
    expect(dialog.open).toBe(true);
    expect(document.querySelector("#result-message").textContent).toBe("Draw");

    const cancelEvent = new dom.window.Event("cancel", { cancelable: true });
    expect(dialog.dispatchEvent(cancelEvent)).toBe(false);
    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(true);
  });

  it("shows the winner dialog and returns home when Continue is clicked", async () => {
    await import("../public/js/main.js?winner-dialog");

    document.querySelector("#start-game").click();
    vi.advanceTimersByTime(3000);
    for (const index of [0, 3, 1, 4, 2]) {
      document.querySelector(`[data-cell="${index}"]`).click();
    }

    expect(document.querySelector("#result-dialog").open).toBe(true);
    expect(document.querySelector("#result-message").textContent).toBe("X Won");
    expect(document.querySelector("#continue").textContent).toBe("Continue");
    expect([...document.querySelectorAll("[data-cell]")].every((cell) => cell.disabled)).toBe(true);

    document.querySelector("#continue").click();

    expect(document.querySelector("#result-dialog").open).toBe(false);
    expect(document.querySelector("#home-screen").hidden).toBe(false);
    expect(document.querySelector("#game-screen").hidden).toBe(true);
    expect([...document.querySelectorAll("[data-cell]")].every((cell) => cell.textContent === "")).toBe(true);
  });

});
