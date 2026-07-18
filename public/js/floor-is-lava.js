/** Pure, date-only domain logic for the daily Floor Is Lava event. */
import { mulberry32 } from "./leaderboard.js";
function getLocalDate(value = new Date()) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export const FLOOR_IS_LAVA_OPPONENT_COUNT = 12;
export const FLOOR_IS_LAVA_STAGES = 6;
export const FLOOR_IS_LAVA_POT = 100;
export const FLOOR_IS_LAVA_OPEN_HOUR = 6;
export const FLOOR_IS_LAVA_CLOSE_HOUR = 18;

const ADJECTIVES = ["Sunny", "Brave", "Coral", "Misty", "Bouncy", "Swift", "Golden", "Cosmic", "Jolly", "Daring", "Lucky", "Clever"];
const CREATURES = ["Gecko", "Puffin", "Otter", "Koala", "Toucan", "Fox", "Crab", "Lynx", "Panda", "Robin", "Tiger", "Wren"];
const PORTRAIT_COLORS = ["#ef6c45", "#f5b942", "#39a99d", "#6d8ce8", "#b96bca", "#ed7892"];

function hashDate(date) {
  let hash = 2166136261;
  for (const char of String(date)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getFloorIsLavaSeed(date) {
  return hashDate(getLocalDate(date));
}

function shuffled(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

/** A compact SVG data payload, useful both in DOM rendering and integrations. */
export function createFloorIsLavaPortrait(index, hue = PORTRAIT_COLORS[index % PORTRAIT_COLORS.length]) {
  const face = index % 3 === 0 ? "M15 29c4 4 10 4 14 0" : index % 3 === 1 ? "M15 28h14" : "M16 30c3-2 9-2 12 0";
  return `<svg viewBox="0 0 44 44" role="img" aria-hidden="true" focusable="false"><circle cx="22" cy="22" r="20" fill="${hue}"/><circle cx="16" cy="19" r="2" fill="#18233b"/><circle cx="28" cy="19" r="2" fill="#18233b"/><path d="${face}" fill="none" stroke="#18233b" stroke-width="2.5" stroke-linecap="round"/></svg>`;
}

export function createFloorIsLavaField(date = new Date()) {
  const localDate = getLocalDate(date);
  const random = mulberry32(getFloorIsLavaSeed(localDate));
  const roster = shuffled(Array.from({ length: FLOOR_IS_LAVA_OPPONENT_COUNT }, (_, index) => ({
    id: `lava-${index}`,
    name: `${ADJECTIVES[index]} ${CREATURES[index]}`,
    portrait: createFloorIsLavaPortrait(index),
    portraitIndex: index
  })), random).map((opponent, order) => ({ ...opponent, order }));
  // Consume after the order so finishers and their number are stable with the daily order.
  const finisherCount = 5 + Math.floor(random() * 6);
  const finishers = new Set(shuffled(roster.map(({ id }) => id), random).slice(0, finisherCount));
  return {
    date: localDate,
    seed: getFloorIsLavaSeed(localDate),
    opponents: roster.map((opponent) => ({ ...opponent, finisher: finishers.has(opponent.id) })),
    finishers: roster.filter((opponent) => finishers.has(opponent.id)).map((opponent) => opponent.id),
    finisherCount
  };
}

export function getFloorIsLavaWindow(now = new Date()) {
  const value = now instanceof Date ? now : new Date(now);
  const date = getLocalDate(value);
  const start = new Date(value.getFullYear(), value.getMonth(), value.getDate(), FLOOR_IS_LAVA_OPEN_HOUR).getTime();
  const end = new Date(value.getFullYear(), value.getMonth(), value.getDate(), FLOOR_IS_LAVA_CLOSE_HOUR).getTime();
  const timestamp = value.getTime();
  return {
    date, start, end, timestamp,
    phase: timestamp < start ? "before" : timestamp < end ? "open" : "closed",
    isOpen: timestamp >= start && timestamp < end,
    canStart: timestamp >= start && timestamp < end
  };
}

export function getFloorIsLavaPayout(date) {
  const field = createFloorIsLavaField(date);
  return Math.floor(FLOOR_IS_LAVA_POT / (1 + field.finisherCount));
}

/** Discrete island levels (0 bottom through 6 reward island), never continuous. */
export function getFloorIsLavaPositions(date, now = new Date()) {
  const field = createFloorIsLavaField(date);
  const window = getFloorIsLavaWindow(now);
  const fraction = Math.max(0, Math.min(1, (window.timestamp - window.start) / (window.end - window.start)));
  return field.opponents.map((opponent, index) => {
    // A deterministic early/late checkpoint produces stepped, not interpolated, movement.
    const checkpoint = ((field.seed >>> (index % 20)) % 17) / 100;
    const adjusted = Math.max(0, Math.min(1, (fraction - checkpoint) / (1 - checkpoint)));
    const maxLevel = opponent.finisher ? FLOOR_IS_LAVA_STAGES : FLOOR_IS_LAVA_STAGES - 1;
    return { ...opponent, level: Math.min(maxLevel, Math.floor(adjusted * (maxLevel + 1))) };
  });
}

export function getFloorIsLavaStatus(event, now = new Date()) {
  const window = getFloorIsLavaWindow(now);
  const wins = Number.isInteger(event?.wins) && event.wins >= 0 && event.wins <= FLOOR_IS_LAVA_STAGES ? event.wins : 0;
  let status = event?.status;
  if (!["active", "eliminated", "completed", "closed"].includes(status)) status = "active";
  if (event?.date !== window.date) status = "active";
  if (status === "active" && window.phase === "closed" && wins < FLOOR_IS_LAVA_STAGES) status = "closed";
  return { ...window, status, wins, stage: Math.min(FLOOR_IS_LAVA_STAGES, wins + 1) };
}

// Friendly aliases for consumers/tests.
export const createDailyLavaField = createFloorIsLavaField;
export const getDailyLavaSeed = getFloorIsLavaSeed;
export const getDailyLavaPositions = getFloorIsLavaPositions;
export const calculateFloorIsLavaPayout = getFloorIsLavaPayout;
export const getEventWindow = getFloorIsLavaWindow;
export const createEventField = createFloorIsLavaField;
export const getEventPositions = getFloorIsLavaPositions;
export const getEventPayout = getFloorIsLavaPayout;
