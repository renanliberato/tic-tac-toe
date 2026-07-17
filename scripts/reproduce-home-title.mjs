import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const dom = new JSDOM(html);
const home = dom.window.document.querySelector("#home-screen");
const homeTitle = home?.querySelector("#home-title");

if (!homeTitle || homeTitle.textContent.trim() !== "TIC TAC TOE") {
  console.error("Issue reproduced: home is missing its TIC TAC TOE title.");
  process.exitCode = 1;
} else {
  console.log("Issue not reproduced: home renders the TIC TAC TOE title.");
}

dom.window.close();
