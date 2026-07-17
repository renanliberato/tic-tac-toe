import { createOpponent, createUuid, getNameForId } from "./identity.js";
import { getCycle } from "./leaderboard.js";
import { DEFAULT_STYLE_ID, getBoardStyle, isBoardStyleId } from "./board-styles.js";

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
    last_move: null,
    leaderboard_cycle: null,
    leaderboard_score: 0,
    owned_styles: [DEFAULT_STYLE_ID],
    equipped_style: DEFAULT_STYLE_ID
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

function normalizeOwnedStyles(value) {
  const supplied = Array.isArray(value) ? value.filter(isBoardStyleId) : [];
  return [DEFAULT_STYLE_ID, ...new Set(supplied.filter((id) => id !== DEFAULT_STYLE_ID))];
}

export function normalizePlayer(value, timestamp = Date.now()) {
  const cycle = getCycle(timestamp);
  const storedCycle = asCount(value.leaderboard_cycle);
  const cycleMatches = cycle && Number.isInteger(value.leaderboard_cycle)
    && value.leaderboard_cycle >= 0 && storedCycle === cycle.index;

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
    last_move: value.last_move ?? null,
    leaderboard_cycle: cycle ? cycle.index : null,
    leaderboard_score: cycleMatches ? asCount(value.leaderboard_score) : 0,
    owned_styles: normalizeOwnedStyles(value.owned_styles),
    equipped_style: isBoardStyleId(value.equipped_style)
      && normalizeOwnedStyles(value.owned_styles).includes(value.equipped_style)
      ? value.equipped_style : DEFAULT_STYLE_ID
  };
}
function readPlayer(storage, timestamp = Date.now()) {
  if (!storage) return null;

  try {
    const value = JSON.parse(storage.getItem(PLAYER_STORAGE_KEY));
    return isPlayer(value) ? normalizePlayer(value, timestamp) : null;
  } catch {
    return null;
  }
}

export function savePlayer(player, storage, timestamp = Date.now()) {
  const resolvedStorage = getStorage(storage);
  const normalizedPlayer = normalizePlayer(player, timestamp);
  memoryPlayer = normalizedPlayer;

  if (!resolvedStorage) return normalizedPlayer;

  try {
    resolvedStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(normalizedPlayer));
  } catch {
    // A full or restricted storage should not stop someone from playing.
  }

  return normalizedPlayer;
}

export function getOrCreatePlayer(storage, timestamp = Date.now()) {
  const resolvedStorage = getStorage(storage);
  const storedPlayer = readPlayer(resolvedStorage, timestamp);

  if (storedPlayer) {
    memoryPlayer = savePlayer(storedPlayer, resolvedStorage, timestamp);
    return memoryPlayer;
  }

  if (!resolvedStorage && memoryPlayer) {
    memoryPlayer = normalizePlayer(memoryPlayer, timestamp);
    return memoryPlayer;
  }

  return savePlayer(newPlayer(), resolvedStorage, timestamp);
}

function withLatestLeaderboard(player, storage, timestamp) {
  const stored = readPlayer(getStorage(storage), timestamp);
  if (!stored || stored.player_id !== player.player_id) return player;
  return {
    ...player,
    leaderboard_cycle: stored.leaderboard_cycle,
    leaderboard_score: stored.leaderboard_score
  };
}

export function reconcileLeaderboardPlayer(player, timestamp = Date.now(), storage) {
  const latest = withLatestLeaderboard(player, storage, timestamp);
  return savePlayer(latest, storage, timestamp);
}

export function awardLeaderboardPoint(player, timestamp = Date.now(), storage) {
  if (!getCycle(timestamp)) return reconcileLeaderboardPlayer(player, timestamp, storage);
  const reconciled = reconcileLeaderboardPlayer(player, timestamp, storage);
  return savePlayer({
    ...reconciled,
    leaderboard_score: asCount(reconciled.leaderboard_score) + 1
  }, storage, timestamp);
}

export function reloadPlayer(storage, timestamp = Date.now()) {
  return getOrCreatePlayer(storage, timestamp);
}
export function startPlayerGame(player, storage, timestamp = Date.now()) {
  const current = withLatestLeaderboard(player, storage, timestamp);
  return savePlayer({
    ...current,
    games_played: asCount(player.games_played) + 1,
    last_move: null
  }, storage, timestamp);
}

export function updatePlayerAfterMove(player, game, index, storage, timestamp = Date.now()) {
  const mark = game?.board?.[index];
  if (!mark) return player;

  const current = withLatestLeaderboard(player, storage, timestamp);
  return savePlayer({
    ...current,
    moves_played: asCount(player.moves_played) + 1,
    last_move: { cell: index, mark }
  }, storage, timestamp);
}

/** Persist the displayed streak when an overall first-to-three match ends. */
export function updatePlayerAfterMatch(player, winner, storage, timestamp = Date.now()) {
  if (winner !== "X" && winner !== "O") return player;

  return savePlayer({
    ...player,
    win_streak: winner === "X" ? Math.min(asWinStreak(player.win_streak) + 1, 3) : 0
  }, storage, timestamp);
}

export function updatePlayerAfterResult(player, game, storage, timestamp = Date.now()) {
  if (!game?.winner && !game?.draw) return player;

  const current = withLatestLeaderboard(player, storage, timestamp);
  return savePlayer({
    ...current,
    wins: asCount(player.wins) + (game.winner === "X" ? 1 : 0),
    draws: asCount(player.draws) + (game.draw ? 1 : 0),
    losses: asCount(player.losses) + (game.winner === "O" ? 1 : 0)
  }, storage, timestamp);
}


/**
 * Adds earned coins to both the durable balance and the one-time presentation
 * queue. Keeping this operation here makes awarding atomic from the app's
 * point of view and keeps currency rules out of the controller and view.
 */
export function awardCoins(player, amount = 3, storage, timestamp = Date.now()) {
  if (amount && typeof amount === "object" && storage === undefined) {
    storage = amount;
    amount = 3;
  }
  const coins = asCount(amount);
  return savePlayer({
    ...player,
    coin_balance: asCount(player.coin_balance) + coins,
    pending_coins: asCount(player.pending_coins) + coins
  }, storage, timestamp);
}

/** Mark all earned coins as presented without changing the durable balance. */
export function consumePendingCoins(player, storage, timestamp = Date.now()) {
  return savePlayer({
    ...player,
    pending_coins: 0
  }, storage, timestamp);
}

/** Atomically purchases/equips a catalog style and returns a descriptive result. */
export function activatePlayerStyle(player, styleId, storage) {
  const normalized = normalizePlayer(player);
  if (!isBoardStyleId(styleId)) return { player: normalized, status: "invalid" };
  if (normalized.equipped_style === styleId) return { player: normalized, status: "equipped" };

  const style = getBoardStyle(styleId);
  if (normalized.owned_styles.includes(styleId)) {
    return { player: savePlayer({ ...normalized, equipped_style: styleId }, storage), status: "equipped-owned", style };
  }
  if (normalized.coin_balance < style.price) {
    return { player: normalized, status: "insufficient", shortfall: style.price - normalized.coin_balance, style };
  }

  return {
    player: savePlayer({
      ...normalized,
      coin_balance: normalized.coin_balance - style.price,
      owned_styles: [...normalized.owned_styles, styleId],
      equipped_style: styleId
    }, storage),
    status: "purchased",
    style
  };
}

export const purchaseOrEquipStyle = activatePlayerStyle;
