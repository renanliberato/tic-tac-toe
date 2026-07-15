import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";

const cellsMarkup = Array.from({ length: 9 }, (_, index) =>
  `<button data-cell="${index}" type="button"></button>`
).join("");

let dom;

beforeEach(() => {
  vi.resetModules();
  dom = new JSDOM(`
    <main>
      <section id="home-screen"><button id="start-game" type="button">Start game</button></section>
      <section id="game-screen" hidden>
        <p id="status"></p>
        <div>${cellsMarkup}</div>
        <button id="reset" type="button">New game</button>
      </section>
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
  });
});
