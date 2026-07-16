import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";

const cellsMarkup = Array.from({ length: 9 }, (_, index) =>
  `<button data-cell="${index}" type="button"></button>`
).join("");

let dom;

beforeEach(() => {
  vi.resetModules();
  dom = new JSDOM(`
    <main class="game">
      <section id="home-screen"><button id="start-game" type="button">Start game</button></section>
      <section id="game-screen" hidden>
        <p id="status" class="status"></p>
        <div class="board" aria-label="Tic-Tac-Toe board">${cellsMarkup}</div>
      </section>
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

  it("starts a fresh game when Start game is clicked", async () => {
    await import("../public/js/main.js?unit");

    document.querySelector("#start-game").click();

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
    for (const index of [0, 3, 1, 4, 2]) {
      document.querySelector(`[data-cell="${index}"]`).click();
    }

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
  });

});
