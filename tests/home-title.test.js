import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { GameController } from "../public/js/controller.js";
import { GameModel } from "../public/js/model.js";
import { GameView } from "../public/js/view.js";

const indexHtml = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../public/css/styles.css", import.meta.url), "utf8");

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

function titleState(documentRef) {
  const home = documentRef.querySelector("#home-screen");
  const title = documentRef.querySelector("#home-title");
  return {
    home,
    title,
    isPresent: Boolean(title && home?.contains(title)),
    isVisible: Boolean(
      title &&
      !title.hidden &&
      documentRef.defaultView.getComputedStyle(title).display !== "none" &&
      documentRef.defaultView.getComputedStyle(title).visibility !== "hidden"
    )
  };
}

let dom;

beforeEach(() => {
  vi.useFakeTimers();
  dom = new JSDOM(indexHtml.replace("</head>", `<style>${styles}</style></head>`), {
    pretendToBeVisual: true
  });
  globalThis.document = dom.window.document;
  globalThis.localStorage = createStorage();
});

afterEach(() => {
  vi.useRealTimers();
  dom.window.close();
  delete globalThis.document;
  delete globalThis.localStorage;
});

describe("ensureHomeTitle", () => {
  it("reveals an existing home title", () => {
    const view = new GameView(dom.window.document);
    const title = dom.window.document.querySelector("#home-title");
    title.hidden = true;

    view.ensureHomeTitle();

    expect(view.homeTitle).toBe(title);
    expect(title.hidden).toBe(false);
  });

  it("recreates a missing title before the home preview", () => {
    const view = new GameView(dom.window.document);
    const home = dom.window.document.querySelector("#home-screen");
    const preview = home.querySelector(".home-preview");
    home.querySelector("#home-title").remove();

    view.ensureHomeTitle();

    expect(view.homeTitle.tagName).toBe("H2");
    expect(view.homeTitle.id).toBe("home-title");
    expect(view.homeTitle.textContent).toBe("TIC TAC TOE");
    expect(home.contains(view.homeTitle)).toBe(true);
    expect([...home.children].indexOf(view.homeTitle)).toBe([...home.children].indexOf(preview) - 1);
    expect(view.homeTitle.hidden).toBe(false);
  });
});

describe("home title integration", () => {
  it("keeps the title present and visible on initial entry and after returning home", () => {
    const model = new GameModel();
    const view = new GameView(dom.window.document);
    const controller = new GameController(model, view);

    let state = titleState(dom.window.document);
    expect(state.isPresent).toBe(true);
    expect(state.title.textContent).toBe("TIC TAC TOE");
    expect(state.home.hidden).toBe(false);
    expect(state.isVisible).toBe(true);

    controller.startGame();
    expect(dom.window.document.querySelector("#home-screen").hidden).toBe(true);

    controller.showHome();
    state = titleState(dom.window.document);
    expect(state.isPresent).toBe(true);
    expect(state.title.textContent).toBe("TIC TAC TOE");
    expect(state.home.hidden).toBe(false);
    expect(state.isVisible).toBe(true);
  });

  it("restores the title if the home view loses it before returning", () => {
    const model = new GameModel();
    const view = new GameView(dom.window.document);
    const controller = new GameController(model, view);

    dom.window.document.querySelector("#home-title").remove();
    controller.startGame();
    controller.showHome();

    const state = titleState(dom.window.document);
    expect(state.isPresent).toBe(true);
    expect(state.title.textContent).toBe("TIC TAC TOE");
    expect(state.isVisible).toBe(true);
  });
});
