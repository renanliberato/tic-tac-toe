import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";

const cellsMarkup = Array.from({ length: 9 }, (_, index) =>
  `<button data-cell="${index}" type="button"></button>`
).join("");

let dom;

function setBoardMetrics() {
  const board = document.querySelector(".board");

  for (const [index, cell] of [...document.querySelectorAll("[data-cell]")].entries()) {
    const left = (index % 3) * 120;
    const top = Math.floor(index / 3) * 120;
    Object.defineProperties(cell, {
      offsetParent: { configurable: true, value: board },
      offsetLeft: { configurable: true, value: left },
      offsetTop: { configurable: true, value: top },
      offsetWidth: { configurable: true, value: 100 },
      offsetHeight: { configurable: true, value: 100 }
    });
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  dom = new JSDOM(`
    <main class="game">
      <section id="home-screen"><button id="start-game" type="button">Start game</button></section>
      <section id="game-screen" hidden>
        <p id="status" class="status"></p>
        <div class="board" aria-label="Tic-Tac-Toe board">${cellsMarkup}</div>
      </section>
      <dialog id="matchmaking-dialog" aria-labelledby="matchmaking-title" aria-describedby="matchmaking-message">
        <h2 id="matchmaking-title">Finding an opponent</h2>
        <p id="matchmaking-message" role="status">Finding an opponent...</p>
      </dialog>
      <dialog id="result-dialog" aria-labelledby="result-message">
        <h2 id="result-message"></h2>
        <p id="result-detail"></p>
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

  it("applies the initial viewport scale to the game page", async () => {
    await import("../public/js/main.js?page-scale");

    const expectedScale = Math.min(
      dom.window.innerWidth / 1125,
      dom.window.innerHeight / 2436
    );

    expect(document.querySelector(".game").style.getPropertyValue("--page-scale"))
      .toBe(String(expectedScale));
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

    document.querySelector("[data-cell=\"0\"]").click();

    expect(document.querySelector("[data-cell=\"0\"]").dataset.mark).toBe("X");
    expect(document.querySelector("[data-cell=\"0\"]").getAttribute("aria-label")).toBe("Cell 1, X");
    expect(document.querySelector("[data-cell=\"0\"]").classList.contains("cell--placed")).toBe(true);
    expect(document.querySelector("#status").classList.contains("status--updated")).toBe(true);
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
    expect(document.querySelector("#result-detail").textContent).toBe("No spaces left on the board.");
    expect(document.querySelector(".board").classList.contains("board--draw")).toBe(true);
    expect(document.querySelector(".game").classList.contains("game--celebrating")).toBe(true);
    expect(document.querySelector("#status").classList.contains("status--draw")).toBe(true);

    const cancelEvent = new dom.window.Event("cancel", { cancelable: true });
    expect(dialog.dispatchEvent(cancelEvent)).toBe(false);
    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(true);
  });

  it("shows the winner dialog and returns home when Continue is clicked", async () => {
    await import("../public/js/main.js?winner-dialog");

    document.querySelector("#start-game").click();
    vi.advanceTimersByTime(3000);

    setBoardMetrics();

    for (const index of [0, 3, 1, 4, 2]) {
      document.querySelector(`[data-cell="${index}"]`).click();
    }

    const winningLine = document.querySelector("[data-winning-line]");
    expect(document.querySelector("#result-dialog").open).toBe(false);
    expect(winningLine.hidden).toBe(false);
    expect(winningLine.dataset.line).toBe("0,1,2");
    expect(winningLine.style.left).toBe("50px");
    expect(winningLine.style.top).toBe("50px");
    expect(winningLine.style.width).toBe("240px");
    expect(winningLine.style.getPropertyValue("--winning-line-angle")).toBe("0rad");
    expect(winningLine.classList.contains("winning-line--active")).toBe(true);

    await vi.advanceTimersByTimeAsync(699);
    expect(document.querySelector("#result-dialog").open).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector("#result-dialog").open).toBe(true);
    expect(document.querySelector("#result-message").textContent).toBe("X Won");
    expect(document.querySelector("#result-detail").textContent).toBe("Three in a row!");
    expect(document.querySelector(".board").classList.contains("board--winner")).toBe(true);
    expect(document.querySelector(".game").classList.contains("game--celebrating")).toBe(true);
    expect(document.querySelector("#status").classList.contains("status--winner")).toBe(true);
    expect([...document.querySelectorAll(".cell--winner")].map((cell) => cell.dataset.cell)).toEqual(["0", "1", "2"]);
    expect(document.querySelector("#continue").textContent).toBe("Continue");
    expect([...document.querySelectorAll("[data-cell]")].every((cell) => cell.disabled)).toBe(true);

    document.querySelector("#continue").click();

    expect(document.querySelector("#result-dialog").open).toBe(false);
    expect(document.querySelector("#home-screen").hidden).toBe(false);
    expect(document.querySelector("#game-screen").hidden).toBe(true);
    expect([...document.querySelectorAll("[data-cell]")].every((cell) => cell.textContent === "")).toBe(true);
    expect(document.querySelector(".game").classList.contains("game--celebrating")).toBe(false);
    expect(document.querySelector(".board").classList.contains("board--winner")).toBe(false);
    expect(document.querySelector("#status").classList.contains("status--winner")).toBe(false);
    expect(winningLine.hidden).toBe(true);
  });

  it.each([
    ["row-0", [0, 3, 1, 4, 2], "0,1,2", 0],
    ["row-1", [3, 0, 4, 1, 5], "3,4,5", 0],
    ["row-2", [6, 0, 7, 1, 8], "6,7,8", 0],
    ["column-0", [0, 1, 3, 2, 6], "0,3,6", Math.PI / 2],
    ["column-1", [1, 0, 4, 2, 7], "1,4,7", Math.PI / 2],
    ["column-2", [2, 0, 5, 1, 8], "2,5,8", Math.PI / 2],
    ["diagonal-main", [0, 1, 4, 2, 8], "0,4,8", Math.PI / 4],
    ["diagonal-reverse", [2, 0, 4, 1, 6], "2,4,6", 3 * Math.PI / 4]
  ])("maps a %s win to the correct line geometry", async (lineClass, moves, line, angle) => {
    await import("../public/js/main.js?winning-line-geometry");

    document.querySelector("#start-game").click();
    vi.advanceTimersByTime(3000);
    setBoardMetrics();
    for (const index of moves) {
      document.querySelector(`[data-cell="${index}"]`).click();
    }

    const winningLine = document.querySelector("[data-winning-line]");
    expect(winningLine.dataset.line).toBe(line);
    expect(winningLine.classList.contains(`winning-line--${lineClass}`)).toBe(true);
    expect(Number.parseFloat(winningLine.style.getPropertyValue("--winning-line-angle")))
      .toBeCloseTo(angle);
  });

  it("uses the winner mark for the line color", async () => {
    await import("../public/js/main.js?winning-line-color");

    document.querySelector("#start-game").click();
    vi.advanceTimersByTime(3000);
    setBoardMetrics();
    for (const index of [1, 0, 2, 4, 3, 8]) {
      document.querySelector(`[data-cell="${index}"]`).click();
    }

    const winningLine = document.querySelector("[data-winning-line]");
    expect(winningLine.dataset.line).toBe("0,4,8");
    expect(winningLine.style.color).toBe("rgb(23, 92, 211)");
  });

});
