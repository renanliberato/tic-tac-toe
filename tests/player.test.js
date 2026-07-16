import { beforeEach, describe, expect, it } from "vitest";
import {
  PLAYER_STORAGE_KEY,
  getOrCreatePlayer,
  startPlayerGame,
  updatePlayerAfterMove,
  updatePlayerAfterResult
} from "../public/js/player.js";

function createStorage() {
  const values = new Map();

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

let storage;

beforeEach(() => {
  storage = createStorage();
});

describe("player data", () => {
  it("creates a player with a UUID as its first data point", () => {
    const player = getOrCreatePlayer(storage);

    expect(Object.keys(player)[0]).toBe("player_id");
    expect(player.player_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(JSON.parse(storage.getItem(PLAYER_STORAGE_KEY))).toEqual(player);
  });

  it("reuses the player ID when the app is opened again", () => {
    const firstPlayer = getOrCreatePlayer(storage);
    const secondPlayer = getOrCreatePlayer(storage);

    expect(secondPlayer.player_id).toBe(firstPlayer.player_id);
    expect(secondPlayer).toEqual(firstPlayer);
  });

  it("replaces malformed or non-UUID player data", () => {
    storage.setItem(PLAYER_STORAGE_KEY, JSON.stringify({ player_id: "not-a-uuid" }));

    const player = getOrCreatePlayer(storage);

    expect(player.player_id).not.toBe("not-a-uuid");
    expect(player.player_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("increments games played and clears the previous move when a game starts", () => {
    const player = getOrCreatePlayer(storage);
    const withMove = updatePlayerAfterMove(
      player,
      { board: ["X", null, null, null, null, null, null, null, null] },
      0,
      storage
    );

    const updatedPlayer = startPlayerGame(withMove, storage);

    expect(updatedPlayer.games_played).toBe(1);
    expect(updatedPlayer.moves_played).toBe(1);
    expect(updatedPlayer.last_move).toBeNull();
    expect(JSON.parse(storage.getItem(PLAYER_STORAGE_KEY))).toEqual(updatedPlayer);
  });

  it.each([
    [{ winner: "X", draw: false }, { wins: 1, draws: 0, losses: 0 }],
    [{ winner: "O", draw: false }, { wins: 1, draws: 0, losses: 1 }],
    [{ winner: null, draw: true }, { wins: 0, draws: 1, losses: 0 }]
  ])("records a completed game result", (game, result) => {
    const player = getOrCreatePlayer(storage);

    const updatedPlayer = updatePlayerAfterResult(player, game, storage);

    expect(updatedPlayer).toMatchObject(result);
    expect(JSON.parse(storage.getItem(PLAYER_STORAGE_KEY))).toEqual(updatedPlayer);
  });

  it("does not update player data for an invalid move", () => {
    const player = getOrCreatePlayer(storage);
    const unchangedPlayer = updatePlayerAfterMove(
      player,
      { board: Array(9).fill(null) },
      0,
      storage
    );

    expect(unchangedPlayer).toEqual(player);
    expect(JSON.parse(storage.getItem(PLAYER_STORAGE_KEY))).toEqual(player);
  });

  it("updates persisted player data after a valid move", () => {
    const player = getOrCreatePlayer(storage);
    const updatedPlayer = updatePlayerAfterMove(
      player,
      { board: ["X", null, null, null, null, null, null, null, null] },
      0,
      storage
    );

    expect(updatedPlayer.player_id).toBe(player.player_id);
    expect(updatedPlayer.moves_played).toBe(1);
    expect(JSON.parse(storage.getItem(PLAYER_STORAGE_KEY))).toEqual(updatedPlayer);
  });

  it("keeps the latest player data when storage becomes unavailable", () => {
    const player = getOrCreatePlayer(storage);
    const updatedPlayer = updatePlayerAfterMove(
      player,
      { board: ["X", null, null, null, null, null, null, null, null] },
      0,
      storage
    );

    expect(getOrCreatePlayer(null)).toEqual(updatedPlayer);
  });
});
