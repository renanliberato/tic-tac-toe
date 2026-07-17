/** Monthly battle-pass rules. This module has no DOM or storage dependencies. */
export const BATTLE_PASS_MILESTONE_COUNT = 100;
export const BATTLE_PASS_DAY = 86_400_000;

function asTimestamp(timestamp) {
  const value = Number(timestamp);
  return Number.isFinite(value) ? value : Date.now();
}

function firstSundayOfMonth(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  return Date.UTC(year, month, 1 + (7 - first.getUTCDay()) % 7);
}

function monthBefore(year, month) {
  return month === 0 ? [year - 1, 11] : [year, month - 1];
}

function monthAfter(year, month) {
  return month === 11 ? [year + 1, 0] : [year, month + 1];
}

function cycleKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * Return the active pass cycle. A month does not roll over until its first
 * Sunday, so the days before that Sunday continue the previous pass.
 */
export function getBattlePassCycle(timestamp = Date.now()) {
  const now = asTimestamp(timestamp);
  const date = new Date(now);
  let year = date.getUTCFullYear();
  let month = date.getUTCMonth();
  let start = firstSundayOfMonth(year, month);

  if (now < start) {
    [year, month] = monthBefore(year, month);
    start = firstSundayOfMonth(year, month);
  }

  const [nextYear, nextMonth] = monthAfter(year, month);
  const end = firstSundayOfMonth(nextYear, nextMonth);
  return { key: cycleKey(year, month), year, month, start, end };
}

export function getBattlePassReward(milestone) {
  if (milestone % 10 === 0) return 10;
  if (milestone % 5 === 0) return 5;
  return 1;
}

export function createBattlePassMilestones() {
  return Array.from({ length: BATTLE_PASS_MILESTONE_COUNT }, (_, index) => {
    const milestone = index + 1;
    return Object.freeze({
      milestone,
      points: milestone,
      reward: getBattlePassReward(milestone)
    });
  });
}

export const BATTLE_PASS_MILESTONES = Object.freeze(createBattlePassMilestones());

export function normalizeBattlePass(value = {}, timestamp = Date.now()) {
  const cycle = getBattlePassCycle(timestamp);
  const points = Number.isInteger(value.battle_pass_points) && value.battle_pass_points >= 0
    ? Math.min(value.battle_pass_points, BATTLE_PASS_MILESTONE_COUNT) : 0;
  const claimed = Array.isArray(value.battle_pass_claimed)
    ? [...new Set(value.battle_pass_claimed.filter((milestone) =>
      Number.isInteger(milestone) && milestone >= 1
        && milestone <= Math.min(points, BATTLE_PASS_MILESTONE_COUNT)))]
      .sort((left, right) => left - right)
    : [];
  const sameCycle = value.battle_pass_cycle === cycle.key;

  return {
    battle_pass_cycle: cycle.key,
    battle_pass_points: sameCycle ? points : 0,
    battle_pass_claimed: sameCycle ? claimed : []
  };
}

export function awardBattlePassPoint(player, timestamp = Date.now()) {
  const progress = normalizeBattlePass(player, timestamp);
  return {
    ...player,
    ...progress,
    battle_pass_points: Math.min(
      BATTLE_PASS_MILESTONE_COUNT,
      progress.battle_pass_points + 1
    )
  };
}

/** Claim a reached, unclaimed milestone and return a descriptive result. */
export function claimBattlePassMilestone(player, milestone, timestamp = Date.now()) {
  const progress = normalizeBattlePass(player, timestamp);
  const item = BATTLE_PASS_MILESTONES.find(({ milestone: value }) => value === milestone);
  const current = { ...player, ...progress };
  if (!item) return { player: current, status: "invalid" };
  if (progress.battle_pass_points < item.points) {
    return { player: current, status: "locked", item };
  }
  if (progress.battle_pass_claimed.includes(item.milestone)) {
    return { player: current, status: "claimed", item };
  }

  return {
    player: {
      ...current,
      coin_balance: (Number.isInteger(current.coin_balance) ? current.coin_balance : 0) + item.reward,
      pending_coins: (Number.isInteger(current.pending_coins) ? current.pending_coins : 0) + item.reward,
      battle_pass_claimed: [...progress.battle_pass_claimed, item.milestone].sort((left, right) => left - right)
    },
    status: "claimed",
    item
  };
}
