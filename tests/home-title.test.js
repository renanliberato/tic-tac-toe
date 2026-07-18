import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { GameController } from "../public/js/controller.js";
import { GameModel } from "../public/js/model.js";
import { GameView } from "../public/js/view.js";

const indexHtml = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../public/css/styles.css", import.meta.url), "utf8");

let dom;
beforeEach(() => {
  vi.useFakeTimers();
  dom = new JSDOM(indexHtml.replace("</head>", `<style>${styles}</style></head>`), { pretendToBeVisual: true });
  globalThis.document = dom.window.document;
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
});
afterEach(() => { vi.useRealTimers(); dom.window.close(); delete globalThis.document; delete globalThis.localStorage; });

describe("home title removal", () => {
  it("does not render the title and labels the home landmark", () => {
    const home = dom.window.document.querySelector("#home-screen");
    expect(home.querySelector("#home-title")).toBeNull();
    expect(home.getAttribute("aria-label")).toBe("Home");
    expect(home.hasAttribute("aria-labelledby")).toBe(false);
  });

  it("does not recreate the title when entering or returning home", () => {
    const view = new GameView(dom.window.document);
    const controller = new GameController(new GameModel(), view);
    controller.startGame();
    controller.showHome();
    expect(dom.window.document.querySelector("#home-title")).toBeNull();
    expect(dom.window.document.querySelector(".home-preview")).toBeTruthy();
    expect(dom.window.document.querySelector("#start-game")).toBeTruthy();
  });
});
