import { createOpponent, createUuid, getNameForId } from "./identity.js";

export const PLAYER_STORAGE_KEY = "tic-tac-toe-player";
export const DAILY_GIFT_REWARDS = Object.freeze([10, 10, 10, 10, 10, 10, 100]);

export { createOpponent, createUuid, getNameForId };

let memoryPlayer = null;
const failedStorages = new WeakSet();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isLocalDate(value) {
  if (typeof value !== "string" || !LOCAL_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function getStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    if (globalThis.localStorage) return globalThis.localStorage;
  } catch { /* use memory */ }
  try {
    if (typeof document !== "undefined" && document.defaultView?.localStorage) {
      return document.defaultView.localStorage;
    }
  } catch { /* use memory */ }
  return null;
}

/** Return a lexically sortable date in the user's local calendar. */
export function getLocalDate(now = new Date()) {
  const value = typeof now === "function" ? now() : now;
  if (isLocalDate(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return getLocalDate(new Date());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function freshGift(date) {
  return { day: 1, claimed: false, eligible_date: date, revision: 0 };
}

function validGift(gift) {
  return gift && typeof gift === "object"
    && Number.isInteger(gift.day) && gift.day >= 1 && gift.day <= 7
    && typeof gift.claimed === "boolean"
    && isLocalDate(gift.eligible_date)
    && Number.isInteger(gift.revision) && gift.revision >= 0;
}

function asCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function isPlayer(value) {
  return value && typeof value === "object"
    && typeof value.player_id === "string" && UUID_PATTERN.test(value.player_id);
}

function normalizePlayer(value, date = getLocalDate()) {
  const normalizedDate = isLocalDate(date)
    ? date : getLocalDate();
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
    last_move: value.last_move ?? null,
    daily_gift: validGift(value.daily_gift) ? { ...value.daily_gift } : freshGift(normalizedDate)
  };
}

function newPlayer(date) {
  const player_id = createUuid();
  return normalizePlayer({ player_id }, date);
}

function readRawPlayer(storage) {
  if (!storage) return null;
  try {
    const value = JSON.parse(storage.getItem(PLAYER_STORAGE_KEY));
    return isPlayer(value) ? value : null;
  } catch { return null; }
}

function readPlayer(storage, date) {
  const value = readRawPlayer(storage);
  return value ? normalizePlayer(value, date) : null;
}

/** Normalize a gift and evaluate exactly one startup against a local date. */
export function evaluateDailyGift(player, now = new Date()) {
  const date = getLocalDate(now);
  const normalized = normalizePlayer(player, date);
  const gift = normalized.daily_gift;
  if (date <= gift.eligible_date) return normalized;

  return {
    ...normalized,
    daily_gift: {
      day: gift.claimed ? (gift.day % DAILY_GIFT_REWARDS.length) + 1 : gift.day,
      claimed: gift.claimed ? false : gift.claimed,
      eligible_date: date,
      revision: gift.revision + 1
    }
  };
}

export function savePlayer(player, storage) {
  const resolvedStorage = getStorage(storage);
  const normalizedPlayer = normalizePlayer(player, player?.daily_gift?.eligible_date);
  memoryPlayer = normalizedPlayer;
  if (!resolvedStorage) return normalizedPlayer;
  try {
    const serialized = JSON.stringify(normalizedPlayer);
    resolvedStorage.setItem(PLAYER_STORAGE_KEY, serialized);
    // Some storage substitutes fail silently. Only trust a verified write.
    if (resolvedStorage.getItem(PLAYER_STORAGE_KEY) !== serialized) {
      failedStorages.add(resolvedStorage);
      return normalizedPlayer;
    }
    failedStorages.delete(resolvedStorage);
  } catch {
    failedStorages.add(resolvedStorage);
  }
  return normalizedPlayer;
}

export function getOrCreatePlayer(storage, now = new Date()) {
  const resolvedStorage = getStorage(storage);
  const date = getLocalDate(now);
  const raw = readRawPlayer(resolvedStorage);
  let player;

  if (raw) {
    player = evaluateDailyGift(normalizePlayer(raw, date), date);
  } else if (!resolvedStorage && memoryPlayer) {
    player = evaluateDailyGift(memoryPlayer, date);
  } else {
    player = newPlayer(date);
  }
  return savePlayer(player, resolvedStorage);
}

/** Read an external update without evaluating it as a new app startup. */
export function readLatestPlayer(storage, now = new Date()) {
  const resolvedStorage = getStorage(storage);
  const date = getLocalDate(now);
  const stored = readPlayer(resolvedStorage, date);
  if (!stored) return memoryPlayer ? normalizePlayer(memoryPlayer, date) : null;
  // If persistence failed, the session's in-memory revision is authoritative.
  if (failedStorages.has(resolvedStorage) && memoryPlayer?.player_id === stored.player_id
      && memoryPlayer.daily_gift.revision >= stored.daily_gift.revision) return memoryPlayer;
  memoryPlayer = stored;
  return stored;
}

/** Atomically mark the offered step claimed and add its durable/pending coins. */
export function claimDailyGift(player, storage) {
  const resolvedStorage = getStorage(storage);
  const latest = readLatestPlayer(resolvedStorage) || normalizePlayer(player);
  const expected = player?.daily_gift;
  const gift = latest.daily_gift;
  const sameOffer = expected && latest.player_id === player.player_id
    && expected.day === gift.day && expected.eligible_date === gift.eligible_date
    && expected.revision === gift.revision && !expected.claimed && !gift.claimed;
  if (!sameOffer) return { player: latest, claimed: false, amount: 0 };

  const amount = DAILY_GIFT_REWARDS[gift.day - 1];
  const updated = savePlayer({
    ...latest,
    coin_balance: latest.coin_balance + amount,
    pending_coins: latest.pending_coins + amount,
    daily_gift: { ...gift, claimed: true, revision: gift.revision + 1 }
  }, resolvedStorage);
  return { player: updated, claimed: true, amount };
}

export function startPlayerGame(player, storage) {
  return savePlayer({ ...player, games_played: asCount(player.games_played) + 1, last_move: null }, storage);
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

export function consumePendingCoins(player, storage, amount = Number.POSITIVE_INFINITY) {
  const consumed = Number.isInteger(amount) && amount >= 0 ? amount : Number.POSITIVE_INFINITY;
  return savePlayer({
    ...player,
    pending_coins: Math.max(0, asCount(player.pending_coins) - consumed)
  }, storage);
}
