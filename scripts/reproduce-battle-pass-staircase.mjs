import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { GameView } from "../public/js/view.js";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const dom = new JSDOM(html);
const view = new GameView(dom.window.document, () => Date.parse("2026-07-05T00:00:00.000Z"));
view.renderBattlePass({ battle_pass_points: 3, battle_pass_claimed: [1, 2, 3] });
const rows = dom.window.document.querySelectorAll("[data-battle-pass-row]");
assert.equal(rows.length, 100, "one aligned row per milestone");
for (const [index, row] of [...rows].entries()) {
  const milestone = index + 1;
  assert.equal(row.dataset.battlePassSide, milestone % 2 ? "left" : "right");
  assert.equal(row.querySelector("[data-battle-pass-milestone]")?.dataset.battlePassMilestone, String(milestone));
  assert.equal(row.querySelector("[data-battle-pass-rail-node]")?.dataset.battlePassRailNode, String(milestone));
  assert.equal(row.querySelector("[data-battle-pass-connector]")?.dataset.battlePassConnector, String(milestone));
}
console.log("battle pass alternating staircase structure passes");
dom.window.close();
