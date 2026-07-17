import { describe, expect, it } from "vitest";
import {
  BOT_ROSTER,
  CYCLE_DURATION,
  DAY_DURATION,
  LEADERBOARD_EPOCH,
  calculateBotScore,
  createBotRoster,
  createStandings,
  generateBotAttributes,
  getCycle,
  mulberry32,
  rankEntries
} from "../public/js/leaderboard.js";

describe("deterministic weekly leaderboard", () => {
  it("uses exact half-open UTC cycles and has no pre-launch cycle", () => {
    expect(getCycle(LEADERBOARD_EPOCH - 1)).toBeNull();
    expect(getCycle(LEADERBOARD_EPOCH)).toEqual({
      index: 0, start: LEADERBOARD_EPOCH, end: LEADERBOARD_EPOCH + CYCLE_DURATION
    });
    expect(getCycle(LEADERBOARD_EPOCH + CYCLE_DURATION - 1).index).toBe(0);
    expect(getCycle(LEADERBOARD_EPOCH + CYCLE_DURATION).index).toBe(1);
    expect(getCycle(LEADERBOARD_EPOCH + 9 * CYCLE_DURATION).index).toBe(9);
  });

  it("creates a stable unique roster independent of a weekly seed", () => {
    expect(BOT_ROSTER).toHaveLength(1000);
    expect(new Set(BOT_ROSTER.map(({ name }) => name))).toHaveLength(1000);
    expect(createBotRoster()).toEqual(BOT_ROSTER);
    expect(generateBotAttributes(0).map(({ name }) => name))
      .toEqual(generateBotAttributes(7).map(({ name }) => name));
  });

  it("locks standard Mulberry32 output and exactly two draws per bot", () => {
    const random = mulberry32(0);
    expect([random(), random(), random(), random()]).toEqual([
      0.26642920868471265, 0.0003297457005828619,
      0.2232720274478197, 0.1462021479383111
    ]);
    expect(generateBotAttributes(0).slice(0, 3).map(({ maxScore, startOffset }) =>
      [maxScore, startOffset])).toEqual([[17, 0], [15, 1], [26, 3]]);
    expect(generateBotAttributes(7).slice(0, 3).map(({ maxScore, startOffset }) =>
      [maxScore, startOffset])).toEqual([[5, 0], [49, 4], [28, 2]]);
  });

  it("progresses after start toward each bot maximum and omits zero scores", () => {
    const cycle = getCycle(LEADERBOARD_EPOCH);
    const early = { maxScore: 28, startOffset: 0 };
    const late = { maxScore: 28, startOffset: 6 };
    expect(calculateBotScore(early, cycle, cycle.start)).toBe(0);
    expect(calculateBotScore(early, cycle, cycle.start + 3.5 * DAY_DURATION)).toBe(14);
    expect(calculateBotScore(late, cycle, cycle.start + 6 * DAY_DURATION)).toBe(0);
    expect(calculateBotScore(late, cycle, cycle.start + 6.5 * DAY_DURATION)).toBe(14);
    expect(calculateBotScore(late, cycle, cycle.end)).toBe(28);
    expect(calculateBotScore(late, cycle, cycle.end + DAY_DURATION)).toBe(28);
    expect(createStandings(LEADERBOARD_EPOCH, { player_name: "Ace", leaderboard_score: 0 }))
      .toEqual([{ type: "local", name: "Ace (You)", score: 0, rank: 1 }]);
  });

  it("uses competition ranks, bot-index ties, and local-after-bots ties", () => {
    const ranked = rankEntries([
      { type: "bot", index: 8, score: 10 },
      { type: "local", name: "Ace", score: 10 },
      { type: "bot", index: 2, score: 10 },
      { type: "bot", index: 1, score: 4 }
    ]);
    expect(ranked.map(({ type, index, rank }) => [type, index, rank])).toEqual([
      ["bot", 2, 1], ["bot", 8, 1], ["local", undefined, 1], ["bot", 1, 4]
    ]);
  });

  it("renders only the zero-score local row before launch", () => {
    expect(createStandings(LEADERBOARD_EPOCH - 1, {
      player_name: "Ace", leaderboard_score: 99
    })).toEqual([{ type: "local", name: "Ace (You)", score: 0, rank: null }]);
  });
});
