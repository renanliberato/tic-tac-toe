import assert from "node:assert/strict";
import { claimDailyGift, getOrCreatePlayer, PLAYER_STORAGE_KEY } from "../public/js/player.js";
const values = new Map();
const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
let player = getOrCreatePlayer(storage, "2026-03-02");
assert.deepEqual(player.daily_gift, { day: 1, claimed: false, eligible_date: "2026-03-02", revision: 0 });
let result = claimDailyGift(player, storage);
assert.equal(result.amount, 10);
assert.equal(claimDailyGift(player, storage).claimed, false);
player = getOrCreatePlayer(storage, "2026-03-05");
assert.equal(player.daily_gift.day, 2);
assert.equal(player.daily_gift.eligible_date, "2026-03-05");
result = claimDailyGift(player, storage);
assert.equal(result.amount, 10);
for (let day = 6; day <= 10; day += 1) {
  player = getOrCreatePlayer(storage, `2026-03-${String(day).padStart(2, "0")}`);
  result = claimDailyGift(player, storage);
}
assert.equal(result.amount, 100);
player = getOrCreatePlayer(storage, "2026-03-11");
assert.equal(player.daily_gift.day, 1);
assert.equal(player.coin_balance, 160);
assert.equal(JSON.parse(storage.getItem(PLAYER_STORAGE_KEY)).coin_balance, 160);
console.log("daily gift state machine passes");
