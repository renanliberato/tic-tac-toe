import fs from "node:fs";
import { JSDOM } from "jsdom";
import { GameModel } from "../public/js/model.js";
import { GameView } from "../public/js/view.js";
import { GameController } from "../public/js/controller.js";
import { PLAYER_STORAGE_KEY } from "../public/js/player.js";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const dom = new JSDOM(html);
const values = new Map([[PLAYER_STORAGE_KEY, JSON.stringify({
  player_id: "123e4567-e89b-42d3-a456-426614174000",
  games_played: 3, moves_played: 12, wins: 2, draws: 0, losses: 1,
  coin_balance: 20, pending_coins: 0, last_move: null
})]]);
globalThis.document = dom.window.document;
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
const check = (condition, label) => { if (!condition) throw new Error(label); };
const view = new GameView(document);
new GameController(new GameModel(), view);

document.querySelector("#open-profile").click();
check(!document.querySelector("#profile-screen").hidden, "profile visible");
check(document.activeElement.id === "profile-title", `profile heading focused: ${document.activeElement.id}`);
check(document.querySelector('[data-stat="win_rate"]').textContent === "67%", "rounded win rate");
document.querySelector("#open-styles").click();
check(document.querySelectorAll("[data-style-id]").length === 9, "nine styles");
const forest = document.querySelector('[data-style-id="forest"]');
forest.focus(); forest.click();
check(document.activeElement === forest, `purchase retains focus: ${document.activeElement?.dataset?.styleId}`);
check(JSON.parse(values.get(PLAYER_STORAGE_KEY)).coin_balance === 11, "purchase balance");
check(document.querySelector(".game").dataset.boardStyle === "forest", "forest applied");
const ocean = document.querySelector('[data-style-id="ocean"]');
ocean.click();
check(document.querySelector("#insufficient-message").textContent === "You need 8 more coins to unlock Ocean", "exact shortfall");
document.querySelector("#insufficient-ok").click();
check(document.activeElement === ocean, "modal restores focus");
console.log("profile/styles UI reproduction passed");

dom.window.close();
delete globalThis.document;
delete globalThis.localStorage;
