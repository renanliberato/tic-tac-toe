import assert from "node:assert/strict";
import {
  BOT_ROSTER, CYCLE_DURATION, LEADERBOARD_EPOCH, calculateBotScore,
  createStandings, generateBotAttributes, getCycle, mulberry32, rankEntries
} from "../public/js/leaderboard.js";

assert.equal(getCycle(LEADERBOARD_EPOCH).index, 0);
assert.equal(getCycle(LEADERBOARD_EPOCH + CYCLE_DURATION - 1).index, 0);
assert.equal(getCycle(LEADERBOARD_EPOCH + CYCLE_DURATION).index, 1);
assert.equal(getCycle(LEADERBOARD_EPOCH - 1), null);
const random = mulberry32(0);
assert.deepEqual([random(), random(), random()], [
  0.26642920868471265, 0.0003297457005828619, 0.2232720274478197
]);
assert.equal(new Set(BOT_ROSTER.map(({ name }) => name)).size, 1000);
assert.deepEqual(generateBotAttributes(0).slice(0, 2).map(({ maxScore, startOffset }) => [maxScore, startOffset]), [[17, 0], [15, 1]]);
const cycle = getCycle(LEADERBOARD_EPOCH);
assert.equal(calculateBotScore({ maxScore: 20, startOffset: 0 }, cycle, cycle.start), 0);
assert.equal(calculateBotScore({ maxScore: 20, startOffset: 0 }, cycle, cycle.end), 20);
assert.deepEqual(rankEntries([
  { type: "local", score: 4 }, { type: "bot", index: 2, score: 4 },
  { type: "bot", index: 1, score: 4 }, { type: "bot", index: 3, score: 2 }
]).map(({ rank, type, index }) => [rank, type, index]), [[1, "bot", 1], [1, "bot", 2], [1, "local", undefined], [4, "bot", 3]]);
assert.equal(createStandings(LEADERBOARD_EPOCH - 1, { player_name: "Ace" })[0].rank, null);
console.log("leaderboard deterministic reproduction passed");
