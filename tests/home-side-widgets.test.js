import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../public/css/styles.css", import.meta.url), "utf8");

function rule(selector) {
  return styles.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

describe("home side widget lists", () => {
  it("keeps utility controls separate and groups home widgets by side", () => {
    const document = new JSDOM(html).window.document;
    const home = document.querySelector("#home-screen");
    const utility = home.querySelector(":scope > .home-utility-row");
    const left = home.querySelector(":scope > .home-widget-list--left");
    const right = home.querySelector(":scope > .home-widget-list--right");

    expect([...utility.children].map((element) => element.id)).toEqual(["coin-holder", "open-profile"]);
    expect([...left.children].map((element) => element.id)).toEqual(["daily-gifts-launcher", "open-floor-is-lava"]);
    expect([...right.children].map((element) => element.id)).toEqual([
      "open-leaderboard",
      "open-battle-pass"
    ]);
    expect(left.querySelector("#daily-gifts-launcher").getAttribute("aria-label")).toBe("Daily gifts");
    expect(left.querySelector("#daily-gifts-launcher svg")).not.toBeNull();
  });

  it("uses a shared vertically centered stack and shared item dimensions", () => {
    const list = rule("\\.game \\.home-widget-list");
    const item = rule("\\.game \\.home-widget-list > button");

    expect(list).toMatch(/position:\s*absolute/);
    expect(list).toMatch(/top:\s*50%/);
    expect(list).toMatch(/display:\s*flex/);
    expect(list).toMatch(/flex-direction:\s*column/);
    expect(list).toMatch(/gap:\s*38px/);
    expect(list).toMatch(/transform:\s*translateY\(-50%\)/);
    expect(rule("\\.game \\.home-widget-list--left")).toMatch(/left:\s*-120px/);
    expect(rule("\\.game \\.home-widget-list--right")).toMatch(/right:\s*-120px/);
    expect(item).toMatch(/width:\s*112px/);
    expect(item).toMatch(/height:\s*112px/);
    expect(styles).not.toMatch(/\.game \.daily-gifts-launcher\s*\{[^}]*position:\s*absolute/s);
    expect(styles).not.toMatch(/\.game \.leaderboard-entry\s*\{[^}]*position:\s*absolute/s);
    expect(styles).not.toMatch(/\.game \.battle-pass-entry\s*\{[^}]*position:\s*absolute/s);
  });
});
