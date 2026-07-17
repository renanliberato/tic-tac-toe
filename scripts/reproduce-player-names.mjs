import { createOpponent } from "../public/js/identity.js";
import { getOrCreatePlayer } from "../public/js/player.js";

const storage = new Map();
const browserStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value)
};

// This represents the app opening for the first time, followed by pressing Play.
const player = getOrCreatePlayer(browserStorage);
const opponent = createOpponent();
console.log(JSON.stringify({
  player: { id: player.player_id, name: player.player_name },
  opponent: { id: opponent.opponent_id, name: opponent.opponent_name }
}, null, 2));
