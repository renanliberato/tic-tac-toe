import { describe, expect, it } from "vitest";
import { CYCLE_DURATION, LEADERBOARD_EPOCH } from "../public/js/leaderboard.js";
import {
  PLAYER_STORAGE_KEY, awardLeaderboardPoint, getOrCreatePlayer,
  reconcileLeaderboardPlayer, startPlayerGame, updatePlayerAfterMove
} from "../public/js/player.js";

function createStorage(value) {
  const values = new Map(value ? [[PLAYER_STORAGE_KEY, JSON.stringify(value)]] : []);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, item) => values.set(key, item)
  };
}
const id = "123e4567-e89b-42d3-a456-426614174000";

describe("weekly local player persistence", () => {
  it("migrates malformed fields, resets at rollover, and persists immediately", () => {
    const storage = createStorage({ player_id: id, wins: 8, leaderboard_cycle: -2, leaderboard_score: "9" });
    const player = getOrCreatePlayer(storage, LEADERBOARD_EPOCH);
    expect(player).toMatchObject({ wins: 8, leaderboard_cycle: 0, leaderboard_score: 0 });
    const scored = awardLeaderboardPoint(player, LEADERBOARD_EPOCH + 1, storage);
    expect(scored.leaderboard_score).toBe(1);
    expect(JSON.parse(storage.getItem(PLAYER_STORAGE_KEY)).leaderboard_score).toBe(1);
    const reset = reconcileLeaderboardPlayer(scored, LEADERBOARD_EPOCH + CYCLE_DURATION, storage);
    expect(reset).toMatchObject({ leaderboard_cycle: 1, leaderboard_score: 0, wins: 8 });
  });

  it("does not create a cycle or award before launch", () => {
    const storage = createStorage({ player_id: id, leaderboard_cycle: 0, leaderboard_score: 9 });
    const player = awardLeaderboardPoint(getOrCreatePlayer(storage, LEADERBOARD_EPOCH - 1), LEADERBOARD_EPOCH - 1, storage);
    expect(player).toMatchObject({ leaderboard_cycle: null, leaderboard_score: 0 });
  });

  it("preserves the newest stored weekly score during stale gameplay writes", () => {
    const storage = createStorage({ player_id: id, leaderboard_cycle: 0, leaderboard_score: 2 });
    const stale = { ...getOrCreatePlayer(storage, LEADERBOARD_EPOCH), leaderboard_score: 0 };
    const scored = awardLeaderboardPoint(stale, LEADERBOARD_EPOCH + 1, storage);
    const started = startPlayerGame(stale, storage, LEADERBOARD_EPOCH + 2);
    const moved = updatePlayerAfterMove(started, { board: ["X"] }, 0, storage, LEADERBOARD_EPOCH + 3);
    expect(scored.leaderboard_score).toBe(3);
    expect(moved.leaderboard_score).toBe(3);
  });

  it("retains weekly data in the storage-unavailable fallback", () => {
    const player = getOrCreatePlayer(null, LEADERBOARD_EPOCH);
    const initialScore = player.leaderboard_score;
    const scored = awardLeaderboardPoint(player, LEADERBOARD_EPOCH + 1, null);
    expect(reconcileLeaderboardPlayer(scored, LEADERBOARD_EPOCH + 2, null).leaderboard_score)
      .toBe(initialScore + 1);
  });
});
