/**
 * Friendly names make a quick match feel more like a game than a debug
 * screen. Keep this list deliberately small and familiar so every generated
 * name is easy to read aloud and remember.
 */
export const COMMON_GAME_NICKNAMES = Object.freeze([
  "Ace",
  "Blaze",
  "Captain",
  "Champion",
  "CleverFox",
  "CosmicPlayer",
  "GameMaster",
  "LuckyStar",
  "MegaMaverick",
  "NeonNinja",
  "PixelPilot",
  "PuzzlePro",
  "QuickDraw",
  "ShadowStriker",
  "StarPlayer",
  "TicTacTitan",
  "VictoryVoyager",
  "Wildcard"
]);

// A descriptive alias makes the intended use clear to callers of this module.
export const GAME_NICKNAMES = COMMON_GAME_NICKNAMES;

/**
 * Return a repeatable nickname for an identifier. This is intentionally not a
 * security hash: it only needs to turn the player's UUID into a stable list
 * index while producing different-looking results for most UUIDs.
 */
export function getNameForId(identifier) {
  const value = String(identifier ?? "");
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return COMMON_GAME_NICKNAMES[(hash >>> 0) % COMMON_GAME_NICKNAMES.length];
}

export const nameFromId = getNameForId;

export function createUuid() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    const nibble = character === "x" ? value : (value & 0x3) | 0x8;
    return nibble.toString(16);
  });

  return uuid;
}

export function createOpponent() {
  const opponent_id = createUuid();
  return { opponent_id, opponent_name: getNameForId(opponent_id) };
}
