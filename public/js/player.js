import { createOpponent, createUuid, getNameForId } from "./identity.js";
import { getCycle } from "./leaderboard.js";
import { normalizeBattlePass, awardBattlePassPoint, claimBattlePassMilestone } from "./battle-pass.js";
import { DEFAULT_STYLE_ID, getBoardStyle, isBoardStyleId } from "./board-styles.js";
import { FLOOR_IS_LAVA_STAGES, getFloorIsLavaPayout, getFloorIsLavaStatus } from "./floor-is-lava.js";

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
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

/** Return a lexically sortable date in the user's local calendar. */
export function getLocalDate(now = new Date()) {
  const value = typeof now === "function" ? now() : now;
  if (isLocalDate(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return getLocalDate(new Date());
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function freshGift(date) {
  return { day: 1, claimed: false, eligible_date: date, revision: 0 };
}

export function freshFloorIsLavaEvent(date = getLocalDate()) {
  return { date: getLocalDate(date), status: "active", wins: 0, revision: 0, pending_progress: false, payout: 0 };
}

function normalizeFloorIsLavaEvent(value, timestamp) {
  const date = getLocalDate(timestamp);
  if (!value || typeof value !== "object" || !isLocalDate(value.date) || value.date !== date) return freshFloorIsLavaEvent(date);
  const wins = Number.isInteger(value.wins) && value.wins >= 0 && value.wins <= FLOOR_IS_LAVA_STAGES ? value.wins : 0;
  const revision = Number.isInteger(value.revision) && value.revision >= 0 ? value.revision : 0;
  let status = ["active", "eliminated", "completed", "closed"].includes(value.status) ? value.status : "active";
  // A malformed completed record must not become a claimable reward.
  if (status === "completed" && wins !== FLOOR_IS_LAVA_STAGES) status = "eliminated";
  if (status === "active" && wins === FLOOR_IS_LAVA_STAGES) status = "completed";
  const evaluated = getFloorIsLavaStatus({ date, status, wins }, timestamp);
  return {
    date, status: evaluated.status, wins, revision,
    pending_progress: status === "active" && wins > 0 && wins < FLOOR_IS_LAVA_STAGES && value.pending_progress === true,
    payout: status === "completed" && Number.isInteger(value.payout) && value.payout === getFloorIsLavaPayout(date)
      ? value.payout : 0
  };
}

function validGift(gift) {
  return gift && typeof gift === "object"
    && Number.isInteger(gift.day) && gift.day >= 1 && gift.day <= 7
    && typeof gift.claimed === "boolean" && isLocalDate(gift.eligible_date)
    && Number.isInteger(gift.revision) && gift.revision >= 0;
}

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
    equipped_style: DEFAULT_STYLE_ID,
    battle_pass_cycle: null,
    battle_pass_points: 0,
    battle_pass_claimed: []
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
  const cycleTimestamp = isLocalDate(timestamp)
    ? new Date(`${timestamp}T12:00:00`).getTime() : timestamp;
  const cycle = getCycle(cycleTimestamp);
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
    daily_gift: validGift(value.daily_gift) ? { ...value.daily_gift } : freshGift(getLocalDate(timestamp)),
    floor_is_lava: normalizeFloorIsLavaEvent(value.floor_is_lava, timestamp),
    equipped_style: isBoardStyleId(value.equipped_style)
      && normalizeOwnedStyles(value.owned_styles).includes(value.equipped_style)
      ? value.equipped_style : DEFAULT_STYLE_ID,
    ...normalizeBattlePass(value, timestamp)
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
    const serialized = JSON.stringify(normalizedPlayer);
    resolvedStorage.setItem(PLAYER_STORAGE_KEY, serialized);
    if (resolvedStorage.getItem(PLAYER_STORAGE_KEY) !== serialized) failedStorages.add(resolvedStorage);
    else failedStorages.delete(resolvedStorage);
  } catch {
    failedStorages.add(resolvedStorage);
  }

  return normalizedPlayer;
}

/** Read an external update without treating it as a new startup. */
export function readLatestPlayer(storage, now = new Date()) {
  const resolvedStorage = getStorage(storage);
  const timestamp = now instanceof Date || typeof now === "number" ? now : getLocalDate(now);
  const stored = readPlayer(resolvedStorage, timestamp);
  if (!stored) return memoryPlayer ? normalizePlayer(memoryPlayer, timestamp) : null;
  if (failedStorages.has(resolvedStorage) && memoryPlayer?.player_id === stored.player_id
      && memoryPlayer.daily_gift.revision >= stored.daily_gift.revision
      && memoryPlayer.floor_is_lava.revision >= stored.floor_is_lava.revision) return memoryPlayer;
  memoryPlayer = stored;
  return stored;
}

/** Atomically mark the offered gift claimed and add its durable/pending coins. */
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
    ...latest, coin_balance: latest.coin_balance + amount,
    pending_coins: latest.pending_coins + amount,
    daily_gift: { ...gift, claimed: true, revision: gift.revision + 1 }
  }, resolvedStorage);
  return { player: updated, claimed: true, amount };
}

export function getOrCreatePlayer(storage, timestamp = Date.now()) {
  const resolvedStorage = getStorage(storage);
  const storedPlayer = readPlayer(resolvedStorage, timestamp);

  if (storedPlayer) {
    memoryPlayer = savePlayer(evaluateDailyGift(storedPlayer, timestamp), resolvedStorage, timestamp);
    return memoryPlayer;
  }

  if (!resolvedStorage && memoryPlayer) {
    memoryPlayer = evaluateDailyGift(memoryPlayer, timestamp);
    return memoryPlayer;
  }

  return savePlayer(newPlayer(), resolvedStorage, timestamp);
}

/** Normalize a gift and advance it once when a new local calendar day begins. */
export function evaluateDailyGift(player, now = new Date()) {
  const date = getLocalDate(now);
  const normalized = normalizePlayer(player, now);
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

export function awardPlayerBattlePassPoint(player, timestamp = Date.now(), storage) {
  return savePlayer(awardBattlePassPoint(player, timestamp), storage, timestamp);
}

export function claimPlayerBattlePassMilestone(player, milestone, storage, timestamp = Date.now()) {
  const result = claimBattlePassMilestone(player, milestone, timestamp);
  return { ...result, player: savePlayer(result.player, storage, timestamp) };
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
export function consumePendingCoins(player, storage, amount = Number.POSITIVE_INFINITY) {
  const consumed = Number.isInteger(amount) && amount >= 0 ? amount : Number.POSITIVE_INFINITY;
  return savePlayer({
    ...player,
    pending_coins: Math.max(0, asCount(player.pending_coins) - consumed)
  }, storage);
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


/** Return a reconciled daily event record, persisting a date reset/close transition. */
export function evaluateFloorIsLava(player, now = new Date()) {
  return normalizePlayer(player, now);
}

export function getFloorIsLavaAttempt(player, now = new Date()) {
  return evaluateFloorIsLava(player, now).floor_is_lava;
}

/** Consume the one-shot Home +1 marker only when this exact active attempt still owns it. */
export function consumeFloorIsLavaProgress(player, expected, storage, now = new Date()) {
  const latest = readLatestPlayer(storage, now) || normalizePlayer(player, now);
  const event = latest.floor_is_lava;
  if (!expected || event.date !== expected.date || event.revision !== expected.revision
      || event.status !== "active" || !event.pending_progress || getFloorIsLavaStatus(event, now).phase !== "open") {
    return { player: latest, consumed: false };
  }
  const updated = savePlayer({ ...latest, floor_is_lava: { ...event, pending_progress: false, revision: event.revision + 1 } }, storage, now);
  return { player: updated, consumed: true };
}

/**
 * Compare-and-commit one completed event match. `expected` is captured before
 * starting the board; stale tabs get accepted:false and no ordinary rewards.
 */
export function commitFloorIsLavaResult(player, expected, outcome, storage, now = new Date(), normal = {}) {
  const latest = readLatestPlayer(storage, now) || normalizePlayer(player, now);
  const event = latest.floor_is_lava;
  const status = getFloorIsLavaStatus(event, now);
  const startedBeforeClose = expected?.started_at == null || Number(expected.started_at) < status.end;
  const valid = expected && latest.player_id === player?.player_id && event.date === expected.date
    && event.revision === expected.revision && event.wins + 1 === expected.stage
    && ["active", "closed"].includes(event.status) && startedBeforeClose
    && (event.status === "active" || status.phase === "closed");
  if (!valid || !["win", "loss", "draw"].includes(outcome)) return { player: latest, accepted: false, payout: 0 };
  if (outcome === "draw") return { player: latest, accepted: true, payout: 0, status: event.status };

  const won = outcome === "win";
  const wins = won ? event.wins + 1 : event.wins;
  const completed = won && wins === FLOOR_IS_LAVA_STAGES;
  const payout = completed ? getFloorIsLavaPayout(event.date) : 0;
  const nextEvent = {
    ...event, wins, revision: event.revision + 1,
    status: completed ? "completed" : won ? (status.phase === "closed" ? "closed" : "active") : "eliminated",
    pending_progress: won && !completed && status.phase === "open",
    payout: completed ? payout : event.payout
  };
  const rounds = Math.max(0, Number.isInteger(normal.rounds) ? normal.rounds : 0);
  const localRoundWins = Math.max(0, Number.isInteger(normal.wins) ? normal.wins : 0);
  const draws = Math.max(0, Number.isInteger(normal.draws) ? normal.draws : 0);
  const losses = Math.max(0, Number.isInteger(normal.losses) ? normal.losses : 0);
  const moves = Math.max(0, Number.isInteger(normal.moves) ? normal.moves : 0);
  const normalMatchWin = won;
  const nextStreak = normalMatchWin ? Math.min(asWinStreak(latest.win_streak) + 1, 3) : 0;
  const ordinaryCoins = normalMatchWin ? (nextStreak === 3 ? 4 : 3) : 0;
  const battle = normalMatchWin ? awardBattlePassPoint(latest, now) : latest;
  const updated = savePlayer({
    ...battle,
    games_played: asCount(latest.games_played) + rounds,
    moves_played: asCount(latest.moves_played) + moves,
    last_move: normal.last_move && Number.isInteger(normal.last_move.cell) ? normal.last_move : latest.last_move,
    wins: asCount(latest.wins) + localRoundWins,
    draws: asCount(latest.draws) + draws,
    losses: asCount(latest.losses) + losses,
    win_streak: nextStreak,
    leaderboard_score: normalMatchWin ? asCount(latest.leaderboard_score) + 1 : latest.leaderboard_score,
    coin_balance: asCount(latest.coin_balance) + ordinaryCoins + payout,
    pending_coins: asCount(latest.pending_coins) + ordinaryCoins + payout,
    floor_is_lava: nextEvent
  }, storage, now);
  return { player: updated, accepted: true, payout, status: nextEvent.status, ordinaryCoins };
}

export const commitDailyLavaResult = commitFloorIsLavaResult;
export const getDailyLavaAttempt = getFloorIsLavaAttempt;
