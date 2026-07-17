import { createOpponent, createUuid, getNameForId } from "./identity.js";

export const PLAYER_STORAGE_KEY = "tic-tac-toe-player";

export { createOpponent, createUuid, getNameForId };

let memoryPlayer = null;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getStorage(storage) {
  if (storage !== undefined) return storage;

  try {
    if (globalThis.localStorage) return globalThis.localStorage;
  } catch {
    // Access to localStorage can throw for an opaque document origin.
  }

  try {
    if (typeof document !== "undefined" && document.defaultView?.localStorage) {
      return document.defaultView.localStorage;
    }
  } catch {
    // Continue with an in-memory player when browser storage is unavailable.
  }

  return null;
}

function newPlayer() {
  const player_id = createUuid();

  return {
    player_id,
    player_name: getNameForId(player_id),
    games_played: 0,
    moves_played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    coin_balance: 0,
    pending_coins: 0,
    win_streak: 0,
    last_move: null
  };
}

function isPlayer(value) {
  return value
    && typeof value === "object"
    && typeof value.player_id === "string"
    && UUID_PATTERN.test(value.player_id);
}

function asCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function asWinStreak(value) {
  return Math.min(asCount(value), 3);
}

function normalizePlayer(value) {
  return {
    player_id: value.player_id,
    player_name: getNameForId(value.player_id),
    games_played: asCount(value.games_played),
    moves_played: asCount(value.moves_played),
    wins: asCount(value.wins),
    draws: asCount(value.draws),
    losses: asCount(value.losses),
    coin_balance: asCount(value.coin_balance),
    pending_coins: asCount(value.pending_coins),
    win_streak: asWinStreak(value.win_streak),
    last_move: value.last_move ?? null
  };
}

function readPlayer(storage) {
  if (!storage) return null;

  try {
    const value = JSON.parse(storage.getItem(PLAYER_STORAGE_KEY));
    return isPlayer(value) ? normalizePlayer(value) : null;
  } catch {
    return null;
  }
}

export function savePlayer(player, storage) {
  const resolvedStorage = getStorage(storage);
  const normalizedPlayer = normalizePlayer(player);
  memoryPlayer = normalizedPlayer;

  if (!resolvedStorage) return normalizedPlayer;

  try {
    resolvedStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(normalizedPlayer));
  } catch {
    // A full or restricted storage should not stop someone from playing.
  }

  return normalizedPlayer;
}

export function getOrCreatePlayer(storage) {
  const resolvedStorage = getStorage(storage);
  const storedPlayer = readPlayer(resolvedStorage);

  if (storedPlayer) {
    memoryPlayer = savePlayer(storedPlayer, resolvedStorage);
    return memoryPlayer;
  }

  if (!resolvedStorage && memoryPlayer) return memoryPlayer;

  return savePlayer(newPlayer(), resolvedStorage);
}

export function startPlayerGame(player, storage) {
  return savePlayer({
    ...player,
    games_played: asCount(player.games_played) + 1,
    last_move: null
  }, storage);
}

export function updatePlayerAfterMove(player, game, index, storage) {
  const mark = game?.board?.[index];
  if (!mark) return player;

  return savePlayer({
    ...player,
    moves_played: asCount(player.moves_played) + 1,
    last_move: { cell: index, mark }
  }, storage);
}

export function updatePlayerAfterResult(player, game, storage) {
  if (!game?.winner && !game?.draw) return player;

  return savePlayer({
    ...player,
    wins: asCount(player.wins) + (game.winner === "X" ? 1 : 0),
    draws: asCount(player.draws) + (game.draw ? 1 : 0),
    losses: asCount(player.losses) + (game.winner === "O" ? 1 : 0)
  }, storage);
}

/** Persist the displayed streak when an overall first-to-three match ends. */
export function updatePlayerAfterMatch(player, winner, storage) {
  if (winner !== "X" && winner !== "O") return player;

  return savePlayer({
    ...player,
    win_streak: winner === "X" ? Math.min(asWinStreak(player.win_streak) + 1, 3) : 0
  }, storage);
}

/**
 * Adds earned coins to both the durable balance and the one-time presentation
 * queue. Keeping this operation here makes awarding atomic from the app's
 * point of view and keeps currency rules out of the controller and view.
 */
export function awardCoins(player, amount = 3, storage) {
  if (amount && typeof amount === "object" && storage === undefined) {
    storage = amount;
    amount = 3;
  }
  const coins = asCount(amount);
  return savePlayer({
    ...player,
    coin_balance: asCount(player.coin_balance) + coins,
    pending_coins: asCount(player.pending_coins) + coins
  }, storage);
}

/** Mark all earned coins as presented without changing the durable balance. */
export function consumePendingCoins(player, storage) {
  return savePlayer({
    ...player,
    pending_coins: 0
  }, storage);
}
