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

  this.dom.window.close();
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

When("I click the {string} button", function (label) {
  const button = [...this.dom.window.document.querySelectorAll("button")]
    .find((candidate) => candidate.textContent === label);
  assert.ok(button, `A button labelled ${label} does not exist`);
  button.click();
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

Then("all board cells are enabled", function () {
  assert.ok(this.cells().every((cell) => !cell.disabled));
});

Then("all board cells are empty", function () {
  assert.deepEqual(this.cells().map((cell) => cell.textContent), Array(9).fill(""));
});

Then("the status says {string}", function (expected) {
  assert.equal(this.dom.window.document.querySelector("#status").textContent, expected);
});

Then("cell {int} contains {string}", function (number, expected) {
  assert.equal(this.cell(number).textContent, expected);
});

Then("the board contains {string} in cells {int}, {int}, and {int}", function (mark, first, second, third) {
  for (const number of [first, second, third]) {
    assert.equal(this.cell(number).textContent, mark);
  }
});

Then("the winning cells are highlighted", function () {
  assert.deepEqual(
    this.cells().filter((cell) => cell.classList.contains("cell--winner")).map((cell) => cell.dataset.cell),
    ["0", "1", "2"]
  );
});

Then("cell {int} has the accessibility label {string}", function (number, expected) {
  assert.equal(this.cell(number).getAttribute("aria-label"), expected);
});

Then("the result dialog says {string}", function (expected) {
  const dialog = this.dom.window.document.querySelector("#result-dialog");
  assert.equal(dialog.open, true);
  assert.equal(dialog.querySelector("#result-message").textContent, expected);
});

Then("the result dialog detail says {string}", function (expected) {
  const dialog = this.dom.window.document.querySelector("#result-dialog");
  assert.equal(dialog.querySelector("#result-detail").textContent, expected);
});

Then("the result dialog has a {string} button", function (label) {
  const dialog = this.dom.window.document.querySelector("#result-dialog");
  assert.ok([...dialog.querySelectorAll("button")].some((button) => button.textContent === label));
});

Then("all board cells are disabled", function () {
  assert.ok(this.cells().every((cell) => cell.disabled));
});
