import { getOrCreatePlayer, activatePlayerStyle, PLAYER_STORAGE_KEY } from "../public/js/player.js";
import { BOARD_STYLES } from "../public/js/board-styles.js";

const check = (condition, label) => { if (!condition) throw new Error(label); };
const values = new Map();
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
let player = getOrCreatePlayer(storage);
check(player.equipped_style === "classic" && player.owned_styles.join() === "classic", "Classic defaults");
player = { ...player, coin_balance: 20 };
let result = activatePlayerStyle(player, "forest", storage);
check(result.status === "purchased" && result.player.coin_balance === 11, "atomic Forest purchase");
result = activatePlayerStyle(result.player, "ocean", storage);
check(result.status === "insufficient" && result.shortfall === 8, "Ocean shortfall");
check(BOARD_STYLES.map(style => style.price).join() === "0,9,19,29,39,49,59,69,89", "catalog prices");
check(JSON.parse(values.get(PLAYER_STORAGE_KEY)).equipped_style === "forest", "equipped style persistence");
console.log("style domain reproduction passed");
