import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { After, Given, Then, When, setWorldConstructor } from "@cucumber/cucumber";

const root = fileURLToPath(new URL("../..", import.meta.url));
const htmlPath = path.join(root, "public/index.html");
const mainPath = path.join(root, "public/js/main.js");

class AppWorld {
  async openGame() {
    const html = await fs.readFile(htmlPath, "utf8");
    this.dom = new JSDOM(html, { url: "http://localhost/" });
    globalThis.window = this.dom.window;
    globalThis.document = this.dom.window.document;
    this.nativeSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (callback, delay, ...args) => this.nativeSetTimeout(
      callback,
      delay === 3000 ? 1 : delay,
      ...args
    );

    // main.js is an application entry point, so import it after the DOM exists.
    // A unique query string gives each scenario a fresh module instance.
    const moduleUrl = `${pathToFileURL(mainPath).href}?scenario=${Date.now()}-${Math.random()}`;
    await import(moduleUrl);
  }

  cell(number) {
    const cell = this.dom.window.document.querySelector(`[data-cell="${number - 1}"]`);
    assert.ok(cell, `Cell ${number} does not exist`);
    return cell;
  }

  cells() {
    return [...this.dom.window.document.querySelectorAll("[data-cell]")];
  }
}

setWorldConstructor(AppWorld);

After(function () {
  if (!this.dom) return;

  this.turnAnnouncementObserver?.disconnect();
  this.dom.window.close();
  globalThis.setTimeout = this.nativeSetTimeout;
  delete globalThis.window;
  delete globalThis.document;
});

Given("I open the tic-tac-toe game", async function () {
  await this.openGame();
  assert.equal(this.dom.window.document.title, "Tic-Tac-Toe");
});

When("I click cell {int}", function (number) {
  this.cell(number).click();
});

When("I resize the viewport to {int} by {int}", function (width, height) {
  Object.defineProperty(this.dom.window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(this.dom.window, "innerHeight", { configurable: true, value: height });
  this.dom.window.dispatchEvent(new this.dom.window.Event("resize"));
});

When("I open the weekly leaderboard", function () {
  const button = this.dom.window.document.querySelector("#open-leaderboard");
  assert.ok(button, "The leaderboard button does not exist");
  button.click();
});

When("I return from the weekly leaderboard", function () {
  const button = this.dom.window.document.querySelector("#leaderboard-back");
  assert.ok(button, "The leaderboard back button does not exist");
  button.click();
});

When("another browser tab changes the leaderboard score to {int}", function (score) {
  const storage = this.dom.window.localStorage;
  const oldValue = storage.getItem("tic-tac-toe-player");
  const player = JSON.parse(oldValue);
  const newValue = JSON.stringify({ ...player, leaderboard_score: score });
  storage.setItem("tic-tac-toe-player", newValue);
  this.dom.window.dispatchEvent(new this.dom.window.StorageEvent("storage", {
    key: "tic-tac-toe-player",
    oldValue,
    newValue,
    storageArea: storage
  }));
});

When("I start matchmaking", function () {
  const button = this.dom.window.document.querySelector("#start-game");
  assert.ok(button, "The Start game button does not exist");
  button.click();
});

When("I watch the turn announcement", function () {
  const announcement = this.dom.window.document.querySelector("#turn-announcement");
  assert.ok(announcement, "The turn announcement does not exist");
  this.turnAnnouncementChanges = 0;
  this.turnAnnouncementObserver = new this.dom.window.MutationObserver((mutations) => {
    this.turnAnnouncementChanges += mutations.length;
  });
  this.turnAnnouncementObserver.observe(announcement, { childList: true, characterData: true, subtree: true });
});

When("matchmaking completes", async function () {
  await new Promise((resolve) => globalThis.setTimeout(resolve, 3000));
});

When("I click the {string} button", async function (label) {
  const button = [...this.dom.window.document.querySelectorAll("button")]
    .find((candidate) => candidate.textContent === label);
  assert.ok(button, `A button labelled ${label} does not exist`);
  button.click();

  if (label === "Start game") {
    await new Promise((resolve) => globalThis.setTimeout(resolve, 3000));
  }
});

When("I try to dismiss the result dialog", function () {
  const dialog = this.dom.window.document.querySelector("#result-dialog");
  const cancelEvent = new this.dom.window.Event("cancel", { cancelable: true });
  dialog.dispatchEvent(cancelEvent);
});

Then("the page scale fits the viewport", function () {
  const page = this.dom.window.document.querySelector(".game");
  const expectedScale = Math.min(
    this.dom.window.innerWidth / 1125,
    this.dom.window.innerHeight / 2436
  );

  assert.equal(page.style.getPropertyValue("--page-scale"), String(expectedScale));
});

Then("the leaderboard screen is visible", function () {
  assert.equal(this.dom.window.document.querySelector("#leaderboard-screen").hidden, false);
});

Then("the leaderboard screen is hidden", function () {
  assert.equal(this.dom.window.document.querySelector("#leaderboard-screen").hidden, true);
});

Then("the leaderboard shows its position, player, and score columns", function () {
  const columns = [...this.dom.window.document.querySelectorAll(
    "#leaderboard-screen [role=columnheader]"
  )].map((column) => column.textContent);
  assert.deepEqual(columns, ["Position", "Player", "Score"]);
});

Then("the leaderboard shows the local player with score {int}", function (score) {
  const stored = JSON.parse(this.dom.window.localStorage.getItem("tic-tac-toe-player"));
  const row = this.dom.window.document.querySelector("#leaderboard-local-row");
  assert.ok(row, "The local leaderboard row does not exist");
  assert.equal(row.querySelector(".leaderboard-row__player").textContent, `${stored.player_name} (You)`);
  assert.equal(row.querySelector(".leaderboard-row__score").textContent, String(score));
});

Then("the leaderboard shows ranked opponents", function () {
  const opponents = [...this.dom.window.document.querySelectorAll(
    "#leaderboard-list .leaderboard-row:not(#leaderboard-local-row)"
  )];
  assert.ok(opponents.length > 0, "No ranked opponents are shown");
  assert.match(opponents[0].querySelector(".leaderboard-row__position").textContent, /^\d+$/);
});

Then("the leaderboard button has focus", function () {
  assert.equal(this.dom.window.document.activeElement.id, "open-leaderboard");
});

Then("the matchmaking dialog is visible", function () {
  assert.equal(this.dom.window.document.querySelector("#matchmaking-dialog").open, true);
});

Then("the matchmaking dialog is hidden", function () {
  assert.equal(this.dom.window.document.querySelector("#matchmaking-dialog").open, false);
});

Then("the home screen is visible", function () {
  assert.equal(this.dom.window.document.querySelector("#home-screen").hidden, false);
});

Then("the home screen is hidden", function () {
  assert.equal(this.dom.window.document.querySelector("#home-screen").hidden, true);
});

Then("the game board is hidden", function () {
  assert.equal(this.dom.window.document.querySelector("#game-screen").hidden, true);
});

Then("the game board is visible", function () {
  assert.equal(this.dom.window.document.querySelector("#game-screen").hidden, false);
});

Then("the local player card shows a friendly name", function () {
  const card = this.dom.window.document.querySelector("[data-player=\"local\"]");
  const name = this.dom.window.document.querySelector("#player-name").textContent.trim();

  assert.ok(card, "The local player card does not exist");
  assert.equal(card.hidden, false);
  assert.match(name, /^[A-Za-z]+$/);
  assert.notEqual(name, "You");
});

Then("the opponent card shows a friendly name", function () {
  const card = this.dom.window.document.querySelector("[data-player=\"opponent\"]");
  const name = this.dom.window.document.querySelector("#opponent-name").textContent.trim();

  assert.ok(card, "The opponent card does not exist");
  assert.equal(card.hidden, false);
  assert.match(name, /^[A-Za-z]+$/);
});

Then("the first board cell has focus", function () {
  assert.equal(this.dom.window.document.activeElement, this.cell(1));
});

Then("all board cells are enabled", function () {
  assert.ok(this.cells().every((cell) => !cell.disabled));
});

Then("all board cells are empty", function () {
  assert.deepEqual(this.cells().map((cell) => cell.textContent), Array(9).fill(""));
});

Then("the {word} player card indicates the active turn", function (player) {
  const card = this.dom.window.document.querySelector(`[data-player="${player}"]`);
  assert.ok(card, `The ${player} player card does not exist`);
  assert.equal(card.classList.contains("player-card--active"), true);
  assert.equal(card.getAttribute("aria-current"), "true");
});

Then("the status says {string}", function (expected) {
  assert.equal(this.dom.window.document.querySelector("#status").textContent, expected);
});

Then("the {word} player score is {int}", function (mark, expected) {
  const id = mark === "X" ? "#player-score" : "#opponent-score";
  assert.equal(this.dom.window.document.querySelector(id).textContent, String(expected));
  assert.equal(
    this.dom.window.document.querySelector(id).getAttribute("aria-label"),
    `${mark === "X" ? "Your" : "Opponent"} score: ${expected}`
  );
});

When("the winning-line animation completes", async function () {
  await new Promise((resolve) => globalThis.setTimeout(resolve, 700));
});

Then("the turn announcement says {string}", function (expected) {
  assert.equal(this.dom.window.document.querySelector("#turn-announcement").textContent, expected);
});

Then("the turn announcement changes once", function () {
  assert.equal(this.turnAnnouncementChanges, 1);
});

Then("cell {int} contains {string}", function (number, expected) {
  assert.equal(this.cell(number).textContent, expected);
});

Then("the board contains {string} in cells {int}, {int}, and {int}", function (mark, first, second, third) {
  for (const number of [first, second, third]) {
    assert.equal(this.cell(number).textContent, mark);
  }
});

Then("the board renders X and O as SVG icons", function () {
  const xIcon = this.cell(1).querySelector("svg");
  const oIcon = this.cell(4).querySelector("svg");

  assert.ok(xIcon, "The X mark is not rendered as an SVG icon");
  assert.ok(oIcon, "The O mark is not rendered as an SVG icon");
  assert.equal(xIcon.namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(oIcon.namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(xIcon.classList.contains("mark-icon--x"), true);
  assert.equal(oIcon.classList.contains("mark-icon--o"), true);
  assert.equal(xIcon.querySelector("path").getAttribute("d"), "M24 24 76 76M76 24 24 76");
  assert.equal(oIcon.querySelector("circle").getAttribute("r"), "29");
  assert.equal(xIcon.querySelector("title").textContent, "X");
  assert.equal(oIcon.querySelector("title").textContent, "O");
});

Then("the winning cells are highlighted", function () {
  assert.deepEqual(
    this.cells().filter((cell) => cell.classList.contains("cell--winner")).map((cell) => cell.dataset.cell),
    ["0", "1", "2"]
  );
});

Then("the result dialog is hidden", function () {
  assert.equal(this.dom.window.document.querySelector("#result-dialog").open, false);
});

Then("the winning line is shown for cells {int}, {int}, and {int}", function (first, second, third) {
  const line = this.dom.window.document.querySelector("[data-winning-line]");
  assert.equal(line.hidden, false);
  assert.equal(line.dataset.line, [first - 1, second - 1, third - 1].join(","));
  assert.ok(line.classList.contains("winning-line--row-0"));
});

Then("cell {int} has the accessibility label {string}", function (number, expected) {
  assert.equal(this.cell(number).getAttribute("aria-label"), expected);
});

async function waitForResultDialog(world) {
  const dialog = world.dom.window.document.querySelector("#result-dialog");
  if (!dialog.open) {
    await new Promise((resolve) => world.dom.window.setTimeout(resolve, 700));
  }
  return dialog;
}

Then("the result dialog says {string}", async function (expected) {
  const dialog = await waitForResultDialog(this);
  assert.equal(dialog.open, true);
  assert.equal(dialog.querySelector("#result-message").textContent, expected);
});

Then("the result dialog detail says {string}", async function (expected) {
  const dialog = await waitForResultDialog(this);
  assert.equal(dialog.querySelector("#result-detail").textContent, expected);
});

Then("player statistics include:", function (dataTable) {
  const stored = this.dom.window.localStorage.getItem("tic-tac-toe-player");
  assert.ok(stored, "Player statistics are not persisted");

  const player = JSON.parse(stored);
  assert.match(player.player_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

  for (const [field, expected] of Object.entries(dataTable.rowsHash())) {
    const actual = field === "last_move" ? JSON.stringify(player[field]) : String(player[field]);
    assert.equal(actual, expected, `Unexpected player statistic for ${field}`);
  }
});

Then("the result dialog has a {string} button", function (label) {
  const dialog = this.dom.window.document.querySelector("#result-dialog");
  assert.ok([...dialog.querySelectorAll("button")].some((button) => button.textContent === label));
});

Then("all board cells are disabled", function () {
  assert.ok(this.cells().every((cell) => cell.disabled));
});
