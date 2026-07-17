/** Deterministic weekly leaderboard calculations. No DOM or storage access. */
export const LEADERBOARD_EPOCH = Date.parse("2026-01-04T00:00:00.000Z");
export const DAY_DURATION = 86_400_000;
export const CYCLE_DURATION = 7 * DAY_DURATION;
export const BOT_COUNT = 1_000;

const ADJECTIVES = [
  "Amber", "Brave", "Calm", "Clever", "Cosmic", "Daring", "Electric", "Emerald",
  "Fierce", "Gentle", "Golden", "Happy", "Hidden", "Jolly", "Kind", "Lucky",
  "Mighty", "Misty", "Nimble", "Noble", "Quick", "Quiet", "Radiant", "Rapid",
  "Royal", "Silver", "Sunny", "Swift", "Vivid", "Warm", "Wild", "Wise"
];
const NOUNS = [
  "Badger", "Bear", "Comet", "Crane", "Dolphin", "Dragon", "Falcon", "Fox",
  "Gecko", "Hawk", "Heron", "Koala", "Lion", "Lynx", "Meteor", "Otter",
  "Owl", "Panda", "Phoenix", "Puma", "Raven", "Robin", "Shark", "Sparrow",
  "Star", "Tiger", "Turtle", "Wolf", "Wren", "Yak", "Zebra", "Bison"
];

export function getCycle(timestamp = Date.now()) {
  const now = Number(timestamp);
  if (!Number.isFinite(now) || now < LEADERBOARD_EPOCH) return null;
  const index = Math.floor((now - LEADERBOARD_EPOCH) / CYCLE_DURATION);
  const start = LEADERBOARD_EPOCH + index * CYCLE_DURATION;
  return { index, start, end: start + CYCLE_DURATION };
}

export const getCycleIndex = (timestamp = Date.now()) => getCycle(timestamp)?.index ?? null;

/**
 * Standard Mulberry32. Every call adds 0x6D2B79F5 modulo 2^32, applies the
 * specified Math.imul/xor mixing steps, and returns the unsigned word / 2^32.
 */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function createBotRoster(count = BOT_COUNT) {
  return Array.from({ length: count }, (_, index) => {
    const adjective = ADJECTIVES[index % ADJECTIVES.length];
    const noun = NOUNS[Math.floor(index / ADJECTIVES.length) % NOUNS.length];
    // 32 x 32 combinations cover the entire fixed 1,000-player roster.
    return { index, name: `${adjective} ${noun}` };
  });
}

export const BOT_ROSTER = Object.freeze(createBotRoster().map(Object.freeze));

export function generateBotAttributes(cycleIndex, roster = BOT_ROSTER) {
  if (!Number.isInteger(cycleIndex) || cycleIndex < 0) return [];
  const random = mulberry32(cycleIndex);
  return roster.map((bot) => ({
    ...bot,
    // Consumption order is contractually fixed: maximum, then start offset.
    maxScore: 5 + Math.floor(random() * 46),
    startOffset: Math.floor(random() * 7)
  }));
}

export function calculateBotScore(bot, cycle, timestamp) {
  if (!cycle) return 0;
  const startTime = cycle.start + bot.startOffset * DAY_DURATION;
  if (timestamp <= startTime) return 0;
  const progress = Math.floor(
    bot.maxScore * (timestamp - startTime) / (cycle.end - startTime)
  );
  return Math.max(0, Math.min(bot.maxScore, progress));
}

export function rankEntries(entries) {
  const sorted = [...entries].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (left.type !== right.type) return left.type === "bot" ? -1 : 1;
    return left.type === "bot" ? left.index - right.index : 0;
  });
  let previousScore;
  let previousRank;
  return sorted.map((entry, index) => {
    const rank = index === 0 || entry.score !== previousScore ? index + 1 : previousRank;
    previousScore = entry.score;
    previousRank = rank;
    return { ...entry, rank };
  });
}

export function createStandings(timestamp, localPlayer, roster = BOT_ROSTER) {
  const cycle = getCycle(timestamp);
  const local = {
    type: "local",
    name: `${localPlayer?.player_name || "Player"} (You)`,
    score: cycle && Number.isInteger(localPlayer?.leaderboard_score)
      && localPlayer.leaderboard_score >= 0 ? localPlayer.leaderboard_score : 0
  };
  if (!cycle) return [{ ...local, rank: null }];

  const bots = generateBotAttributes(cycle.index, roster)
    .map((bot) => ({
      type: "bot",
      index: bot.index,
      name: bot.name,
      score: calculateBotScore(bot, cycle, timestamp)
    }))
    .filter((bot) => bot.score > 0);
  return rankEntries([...bots, local]);
}

// Descriptive aliases make the pure API convenient for integrations.
export const getLeaderboardCycle = getCycle;
export const getBotScore = calculateBotScore;
export const buildStandings = createStandings;

export const LEADERBOARD_EPOCH_MS = LEADERBOARD_EPOCH;
export const ONE_DAY_MS = DAY_DURATION;
export const WEEK_MS = CYCLE_DURATION;
export const getWeeklyCycle = getCycle;
export const generateRoster = createBotRoster;
export const generateWeeklyBots = generateBotAttributes;
export const scoreBot = calculateBotScore;
export const rankLeaderboard = rankEntries;
