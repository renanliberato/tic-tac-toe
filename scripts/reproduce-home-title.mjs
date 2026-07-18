import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const dom = new JSDOM(html);
const home = dom.window.document.querySelector("#home-screen");
const homeTitle = home?.querySelector("#home-title");

if (homeTitle || home?.getAttribute("aria-label") !== "Home" || home?.hasAttribute("aria-labelledby")) {
  console.error("Issue reproduced: home still exposes the removed title or stale landmark labeling.");
  process.exitCode = 1;
} else {
  console.log("Issue not reproduced: home has no title and uses an accessible label.");
}

dom.window.close();
