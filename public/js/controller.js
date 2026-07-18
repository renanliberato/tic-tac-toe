import { getWinningLine } from "./game.js";
import { getBattlePassCycle } from "./battle-pass.js";
import { createFloorIsLavaField, getFloorIsLavaStatus } from "./floor-is-lava.js";
import { createOpponent } from "./identity.js";
import {
  awardLeaderboardPoint,
  awardPlayerBattlePassPoint,
  claimPlayerBattlePassMilestone,
  getOrCreatePlayer,
  reconcileLeaderboardPlayer,
  reloadPlayer,
  startPlayerGame,
  updatePlayerAfterMove,
  updatePlayerAfterResult,
  updatePlayerAfterMatch,
  awardCoins,
  consumePendingCoins,
  activatePlayerStyle,
  claimDailyGift,
  readLatestPlayer,
  commitFloorIsLavaResult,
  consumeFloorIsLavaProgress,
  getFloorIsLavaAttempt,
  PLAYER_STORAGE_KEY
} from "./player.js";

const AI_MOVE_DELAY = 500;
const MATCHMAKING_DURATION = 3000;
const MATCH_POINTS_TO_WIN = 3;
const COMPUTER_OPPONENT = Object.freeze({
  opponent_id: "computer",
  opponent_name: "Computer",
  opponent_role: "AI Opponent"
});

function createMatchScore() {
  return { X: 0, O: 0 };
}

/**
 * Coordinates user actions and application state without directly touching
 * the DOM. The controller is the glue between the model and the view.
 */
export class GameController {
  constructor(model, view, timer = globalThis, random = Math.random) {
    this.model = model;
    this.view = view;
    this.timer = timer;
    this.random = random;
    this.now = typeof timer.now === "function" ? timer.now : () => Date.now();
    this.gameStarted = false;
    this.matchmakingTimer = null;
    this.aiTimer = null;
    this.aiPending = false;
    this.player = getOrCreatePlayer(undefined, this.now());
    this.opponent = null;
    this.matchScore = createMatchScore();
    this.resultRecorded = false;
    this.roundId = 0;
    this.coinPresentationActive = false;
    this.coinPresentationQueue = [];
    this.homePresentationEnabled = true;
    this.scheduledPendingCoins = 0;
    this.startupGiftHandled = false;
    this.pendingBattlePassVfx = null;
    this.eventMatch = null;
    this.eventRoundStats = null;
    this.floorIsLavaRefreshTimer = null;
    this.homeProgressQueued = false;

    this.model.subscribe(() => this.render());
    this.bindViewEvents();
    this.view.bindDialogGuards();
    this.render();
    this.bindStorageSync();
    this.startupDailyGift();
  }

  bindViewEvents() {
    this.view.onStart(() => this.startGame());
    this.view.cells.forEach((_, index) => {
      this.view.onCell(index, () => this.play(index));
    });
    this.view.onContinue(() => this.eventMatch ? this.showFloorIsLava() : this.showHome());
    this.view.onLeaderboardOpen?.(() => this.showLeaderboard());
    this.view.onLeaderboardBack?.(() => this.leaveLeaderboard());
    this.view.onBattlePassOpen?.(() => this.showBattlePass());
    this.view.onBattlePassBack?.(() => this.leaveBattlePass());
    this.view.onBattlePassClaim?.((milestone) => this.claimBattlePass(milestone));
    this.view.onLeaderboardRefresh?.((fromStorage = false) =>
      this.refreshLeaderboardPlayer(fromStorage));
    this.view.onProfile?.(() => this.showProfile());
    this.view.onProfileBack?.(() => this.showHomeFromProfile());
    this.view.onStyles?.(() => this.showStyles());
    this.view.onStylesBack?.(() => this.showProfileFromStyles());
    this.view.onStyle?.((styleId, tile) => this.activateStyle(styleId, tile));
    this.view.onDailyGiftOpen?.(() => this.openDailyGift(this.view.dailyGiftLauncher));
    this.view.onFloorIsLavaOpen?.(() => this.showFloorIsLava());
    this.view.onFloorIsLavaBack?.(() => this.showHome({ focusFloorIsLava: true }));
    this.view.onFloorIsLavaStart?.(() => this.startFloorIsLavaMatch());
  }

  render() {
    const state = this.model.getState();
    const winningLine = state.winner ? getWinningLine(state.board) || [] : [];
    this.view.render(
      state,
      this.gameStarted,
      winningLine,
      this.player,
      this.opponent,
      this.matchScore,
      this.aiPending
    );
  }

  play(index) {
    const state = this.model.getState();
    if (!this.gameStarted || this.aiPending || state.player !== "X"
      || state.winner || state.draw || state.board[index] !== null) return;

    this.aiPending = true;
    if (!this.model.makeMove(index)) {
      this.aiPending = false;
      this.render();
      return;
    }
    const acceptedState = this.model.getState();
    if (this.eventMatch) {
      this.eventRoundStats.moves += 1;
      this.eventRoundStats.last_move = { cell: index, mark: acceptedState.board[index] };
    } else {
      this.player = updatePlayerAfterMove(this.player, acceptedState, index, undefined, this.now());
    }
    this.finishMove(index);
    if (acceptedState.winner || acceptedState.draw) {
      this.aiPending = false;
      this.render();
      return;
    }
    this.scheduleComputerMove();
  }

  scheduleComputerMove() {
    const scheduledRoundId = this.roundId;
    this.cancelComputerMove(false);
    this.aiPending = true;
    this.render();
    this.aiTimer = this.timer.setTimeout(() => {
      this.aiTimer = null;
      if (!this.isCurrentRound(scheduledRoundId)) return;
      const state = this.model.getState();
      if (!this.aiPending || state.player !== "O" || state.winner || state.draw) return;
      const freeCells = state.board
        .map((mark, index) => mark === null ? index : null)
        .filter((index) => index !== null);
      if (!freeCells.length) {
        this.aiPending = false;
        this.render();
        return;
      }
      const value = Number(this.random());
      const randomIndex = Number.isFinite(value)
        ? Math.min(freeCells.length - 1, Math.max(0, Math.floor(value * freeCells.length)))
        : 0;
      const index = freeCells[randomIndex];
      this.aiPending = false;
      if (this.model.makeMove(index)) this.finishMove(index);
    }, AI_MOVE_DELAY);
  }

  finishMove(index) {
    const state = this.model.getState();
    const completedRoundId = this.roundId;
    this.recordResult(state);
    this.view.replayMove(index);
    if (state.winner) {
      const finalRound = this.matchScore[state.winner] >= MATCH_POINTS_TO_WIN;
      this.view.animateWinningLine(getWinningLine(state.board)).then(() => {
        if (!this.isCurrentRound(completedRoundId)) return;
        if (finalRound) this.showResult();
        else this.startNextRound(completedRoundId);
      });
    } else if (state.draw) {
      this.startNextRound(completedRoundId);
    }
  }

  // Compatibility entry point; local play now starts immediately.
  startMatchmaking() {
    this.homePresentationEnabled = false;
    this.view.finishCoinPresentation?.();
    if (this.matchmakingTimer !== null) return;

    this.view.closeResultDialog();
    this.view.resetFeedback();
    this.opponent = createOpponent();
    this.matchScore = createMatchScore();
    this.resultRecorded = false;
    this.roundId += 1;
    this.gameStarted = false;
    this.model.reset();
    this.view.showMatchmaking();
    this.view.openMatchmakingDialog();

    this.matchmakingTimer = this.timer.setTimeout(() => {
      this.matchmakingTimer = null;
      this.startGame();
    }, MATCHMAKING_DURATION);
    this.render();
  }

  startGame() {
    this.cancelFloorIsLavaProgress();
    this.homePresentationEnabled = false;
    this.stopMatchmaking();
    this.view.closeResultDialog();
    this.view.resetFeedback();
    this.gameStarted = true;
    this.eventMatch = null;
    this.eventRoundStats = null;
    this.opponent = COMPUTER_OPPONENT;
    this.matchScore = createMatchScore();
    this.resultRecorded = false;
    this.roundId += 1;
    this.player = startPlayerGame(this.player, undefined, this.now());
    this.view.showGame();
    this.model.reset();
    this.view.focusFirstCell();
  }

  startNextRound(completedRoundId) {
    this.cancelComputerMove();
    if (!this.isCurrentRound(completedRoundId) || this.isMatchOver()) return;

    this.view.resetFeedback();
    this.resultRecorded = false;
    this.roundId += 1;
    if (this.eventMatch) {
      this.eventRoundStats.games += 1;
    } else {
      this.player = startPlayerGame(this.player, undefined, this.now());
    }
    this.model.reset();
    this.view.focusFirstCell();
  }

  showHome(options = {}) {
    this.cancelComputerMove();
    this.stopFloorIsLavaLifecycle();
    this.view.stopLeaderboard?.();
    this.stopMatchmaking();
    this.view.resetFeedback();
    this.opponent = null;
    this.eventMatch = null;
    this.eventRoundStats = null;
    this.view.closeResultDialog();
    this.gameStarted = false;
    this.roundId += 1;
    this.model.reset();
    this.view.showHome(options);
    this.homePresentationEnabled = true;
    this.enterHomePresentation();
  }

  startupDailyGift() {
    if (!this.startupGiftHandled && !this.player.daily_gift.claimed && this.view.openDailyGift) {
      this.startupGiftHandled = true;
      if (this.openDailyGift(this.view.dailyGiftLauncher)) {
        this.view.renderCoinBalance?.(Math.max(0, this.player.coin_balance - this.player.pending_coins));
        return;
      }
    }
    this.startupGiftHandled = true;
    this.enterHomePresentation();
  }

  openDailyGift(opener) {
    return this.view.openDailyGift?.(this.player.daily_gift, {
      claim: () => this.claimDailyGift(),
      dismiss: () => { if (!this.coinPresentationActive) this.enterHomePresentation(); }
    }, opener);
  }

  claimDailyGift() {
    const priorPending = this.player.pending_coins;
    const result = claimDailyGift(this.player);
    this.player = result.player;
    if (!result.claimed) {
      this.view.renderDailyGift?.(this.player.daily_gift);
      this.view.closeDailyGift?.();
      this.view.renderCoinBalance?.(this.player.coin_balance);
      return;
    }
    const finish = () => {
      this.view.closeDailyGift?.();
      const amount = this.coinPresentationActive ? result.amount : priorPending + result.amount;
      this.queueCoinPresentation(amount);
    };
    const animation = this.view.animateDailyGiftClaim?.(this.player.daily_gift);
    if (animation?.then) animation.then(finish); else finish();
  }

  presentFloorIsLavaProgress() {
    const event = getFloorIsLavaAttempt(this.player, this.now());
    if (this.homeProgressQueued || !event.pending_progress || getFloorIsLavaStatus(event, this.now()).phase !== "open" || event.status !== "active") return;
    const result = consumeFloorIsLavaProgress(this.player, event, undefined, this.now());
    this.player = result.player;
    if (!result.consumed) return;
    this.homeProgressQueued = true;
    const complete = () => { this.homeProgressQueued = false; this.enterHomePresentation(); };
    if (this.view.presentFloorIsLavaProgress) this.view.presentFloorIsLavaProgress(complete);
    else complete();
  }

  enterHomePresentation() {
    if (!this.homePresentationEnabled) return;
    if (!this.coinPresentationActive && !this.homeProgressQueued) { this.presentFloorIsLavaProgress(); if (this.homeProgressQueued) return; }
    this.reconcileCoinPresentationQueue();
    if (!this.coinPresentationActive) {
      const next = this.coinPresentationQueue.shift();
      if (next) {
        this.startCoinPresentation(next);
        return;
      }
    }
    const unscheduled = Math.max(0, this.player.pending_coins - this.scheduledPendingCoins);
    if (unscheduled > 0) this.queueCoinPresentation(unscheduled);
    else if (!this.coinPresentationActive) this.view.renderCoinBalance?.(this.player.coin_balance);
  }

  reconcileCoinPresentationQueue() {
    const queuedTotal = this.coinPresentationQueue.reduce((total, amount) => total + amount, 0);
    const activeAmount = this.coinPresentationActive
      ? Math.max(0, this.scheduledPendingCoins - queuedTotal)
      : 0;
    let remaining = Math.max(0, this.player.pending_coins - activeAmount);
    const reconciled = [];

    for (const amount of this.coinPresentationQueue) {
      const retained = Math.min(amount, remaining);
      if (retained > 0) reconciled.push(retained);
      remaining -= retained;
      if (remaining <= 0) break;
    }

    this.coinPresentationQueue = reconciled;
    this.scheduledPendingCoins = activeAmount
      + reconciled.reduce((total, amount) => total + amount, 0);
  }

  queueCoinPresentation(amount) {
    if (!Number.isInteger(amount) || amount <= 0) return;
    this.scheduledPendingCoins += amount;
    if (this.coinPresentationActive || !this.homePresentationEnabled) {
      this.coinPresentationQueue.push(amount);
      return;
    }
    this.startCoinPresentation(amount);
  }

  startCoinPresentation(amount) {
    this.coinPresentationActive = true;
    const presentation = { ...this.player, pending_coins: amount };
    const complete = () => {
      this.player = consumePendingCoins(this.player, undefined, amount);
      this.scheduledPendingCoins = Math.max(0, this.scheduledPendingCoins - amount);
      this.coinPresentationActive = false;
      this.enterHomePresentation();
    };
    if (this.view.enterHome) this.view.enterHome(presentation, complete); else complete();
  }

  bindStorageSync() {
    const windowRef = this.view.document?.defaultView;
    windowRef?.addEventListener?.("storage", event => {
      if (event.key !== PLAYER_STORAGE_KEY) return;
      const latest = readLatestPlayer();
      if (!latest || latest.player_id !== this.player.player_id) return;
      this.player = latest;
      this.reconcileCoinPresentationQueue();
      this.view.renderDailyGift?.(latest.daily_gift);
      if (!this.coinPresentationActive) this.view.renderCoinBalance?.(latest.coin_balance);
      if (latest.daily_gift.claimed && this.view.dailyGiftMode === "claimable") this.view.closeDailyGift?.();
      if (this.view.floorIsLavaOpen) this.renderFloorIsLava();
    });
  }

  cancelFloorIsLavaProgress() {
    this.view.finishFloorIsLavaProgress?.();
    this.homeProgressQueued = false;
  }

  showLeaderboard() {
    this.cancelFloorIsLavaProgress();
    this.player = this.refreshLeaderboardPlayer();
    this.view.showLeaderboard(this.player, this.now());
  }

  showBattlePass() {
    this.cancelFloorIsLavaProgress();
    this.view.finishCoinPresentation?.();
    const timestamp = this.now();
    if (this.player.battle_pass_cycle !== getBattlePassCycle(timestamp).key) {
      this.player = reloadPlayer(undefined, timestamp);
    }
    this.view.renderBattlePass?.(this.player, timestamp);
    this.view.showBattlePass?.(this.player, timestamp);
    if (this.pendingBattlePassVfx !== null) {
      const milestone = this.pendingBattlePassVfx;
      this.pendingBattlePassVfx = null;
      this.view.triggerBattlePassVfx?.(milestone);
    }
  }

  leaveBattlePass() {
    this.showHome({ focusBattlePass: true });
  }

  claimBattlePass(milestone) {
    const wasClaimed = Array.isArray(this.player.battle_pass_claimed)
      && this.player.battle_pass_claimed.includes(milestone);
    const result = claimPlayerBattlePassMilestone(
      this.player, milestone, undefined, this.now()
    );
    this.player = result.player;
    this.render();
    this.view.renderBattlePass?.(this.player, this.now());
    if (result.status === "claimed" && !wasClaimed) {
      this.view.triggerBattlePassVfx?.(result.item.milestone);
    }
    this.view.announceBattlePass?.(result.status === "claimed"
      ? `${result.item.reward} gold claimed from milestone ${result.item.milestone}`
      : result.status === "locked"
        ? `Milestone ${milestone} is not reached yet`
        : "That milestone is unavailable");
  }

  leaveLeaderboard() {
    this.view.stopLeaderboard?.();
    this.view.showHome({ focusLeaderboard: true });
  }

  refreshLeaderboardPlayer(fromStorage = false) {
    this.player = fromStorage
      ? reloadPlayer(undefined, this.now())
      : reconcileLeaderboardPlayer(this.player, this.now());
    return this.player;
  }

  showProfile() {
    this.cancelFloorIsLavaProgress();
    this.view.finishCoinPresentation?.();
    if (!this.coinPresentationActive && this.player.pending_coins > 0) {
      this.enterHomePresentation();
      this.view.finishCoinPresentation?.();
    }
    this.render();
    this.view.showProfile?.(this.player);
  }

  showHomeFromProfile() {
    this.view.showHome?.({ focusProfile: true });
  }

  showStyles() {
    this.view.renderStyles?.(this.player);
    this.view.showStyles?.();
  }

  showProfileFromStyles() {
    this.view.showProfile?.(this.player, { focusStyles: true });
  }

  activateStyle(styleId, tile) {
    const result = activatePlayerStyle(this.player, styleId);
    if (result.status === "insufficient") {
      this.view.showInsufficientCoins?.(result.style, result.shortfall, tile);
      return;
    }
    if (result.status !== "purchased" && result.status !== "equipped-owned") return;

    this.player = result.player;
    this.render();
    this.view.renderStyles?.(this.player);
    this.view.announceStyle?.(result.status === "purchased"
      ? `Purchased and equipped ${result.style.name}`
      : `Equipped ${result.style.name}`);
  }

  stopMatchmaking() {
    if (this.matchmakingTimer !== null) {
      this.timer.clearTimeout(this.matchmakingTimer);
      this.matchmakingTimer = null;
    }
    this.view.closeMatchmakingDialog?.();
  }

  cancelComputerMove(render = true) {
    if (this.aiTimer !== null) {
      this.timer.clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }
    const changed = this.aiPending;
    this.aiPending = false;
    if (render && changed) this.render();
  }

  recordResult(state) {
    if (this.resultRecorded || (!state.winner && !state.draw)) return;
    if (this.eventMatch) {
      this.recordFloorIsLavaRound(state);
      return;
    }
    const matchWinner = state.winner && this.matchScore[state.winner] + 1 >= MATCH_POINTS_TO_WIN;
    this.player = updatePlayerAfterResult(this.player, state, undefined, this.now());
    if (state.winner) {
      const decisiveLocalWin = state.winner === "X" && this.matchScore.X === MATCH_POINTS_TO_WIN - 1;
      this.matchScore = { ...this.matchScore, [state.winner]: this.matchScore[state.winner] + 1 };
      if (decisiveLocalWin) this.player = awardLeaderboardPoint(this.player, this.now());
    }
    if (matchWinner) {
      this.player = updatePlayerAfterMatch(this.player, state.winner, undefined, this.now());
      if (state.winner === "X") {
        const pointsBefore = this.player.battle_pass_points;
        this.player = awardPlayerBattlePassPoint(this.player, this.now());
        if (this.player.battle_pass_points > pointsBefore) this.pendingBattlePassVfx = this.player.battle_pass_points;
        this.player = awardCoins(this.player, this.player.win_streak === 3 ? 4 : 3, undefined, this.now());
      }
    }
    this.resultRecorded = true;
    this.render();
  }

  recordFloorIsLavaRound(state) {
    const stats = this.eventRoundStats;
    if (!stats) return;
    if (state.draw) stats.draws += 1;
    if (state.winner === "X") stats.wins += 1;
    if (state.winner === "O") stats.losses += 1;
    if (state.winner) this.matchScore = { ...this.matchScore, [state.winner]: this.matchScore[state.winner] + 1 };
    const matchWinner = state.winner && this.matchScore[state.winner] >= MATCH_POINTS_TO_WIN;
    this.resultRecorded = true;
    if (!matchWinner) { this.render(); return; }
    const result = commitFloorIsLavaResult(this.player, this.eventMatch, state.winner === "X" ? "win" : "loss", undefined, this.now(), { ...stats, rounds: stats.games });
    this.player = result.player;
    if (!result.accepted) {
      // Another tab won the race: abandon every buffered result and reconcile.
      this.eventMatch = null;
      this.eventRoundStats = null;
      this.gameStarted = false;
      this.roundId += 1;
      this.model.reset();
      this.showFloorIsLava();
      return;
    }
    this.render();
  }

  showFloorIsLava() {
    this.cancelComputerMove();
    this.stopMatchmaking();
    this.view.closeResultDialog?.();
    this.player = reloadPlayer(undefined, this.now());
    this.eventMatch = null;
    this.eventRoundStats = null;
    this.gameStarted = false;
    this.roundId += 1;
    this.model.reset();
    this.renderFloorIsLava();
    this.view.showFloorIsLava?.();
    this.startFloorIsLavaLifecycle();
  }

  renderFloorIsLava() {
    const now = this.now();
    this.player = reloadPlayer(undefined, now);
    const attempt = getFloorIsLavaAttempt(this.player, now);
    this.view.renderFloorIsLava?.(attempt, createFloorIsLavaField(attempt.date), now);
  }

  startFloorIsLavaLifecycle() {
    this.stopFloorIsLavaLifecycle();
    this.floorIsLavaRefreshTimer = this.timer.setInterval?.(() => {
      if (this.view.floorIsLavaOpen) this.renderFloorIsLava();
    }, 30_000) ?? null;
  }

  stopFloorIsLavaLifecycle() {
    if (this.floorIsLavaRefreshTimer !== null) this.timer.clearInterval?.(this.floorIsLavaRefreshTimer);
    this.floorIsLavaRefreshTimer = null;
  }

  startFloorIsLavaMatch() {
    this.cancelFloorIsLavaProgress();
    const now = this.now();
    this.player = reloadPlayer(undefined, now);
    const event = getFloorIsLavaAttempt(this.player, now);
    const state = getFloorIsLavaStatus(event, now);
    if (!state.canStart || state.status !== "active" || event.wins >= MATCH_POINTS_TO_WIN + 3) {
      this.renderFloorIsLava();
      return false;
    }
    const field = createFloorIsLavaField(event.date);
    const opponent = field.opponents[event.wins];
    if (!opponent) return false;
    this.stopFloorIsLavaLifecycle();
    this.homePresentationEnabled = false;
    this.view.finishCoinPresentation?.();
    this.eventMatch = { date: event.date, revision: event.revision, stage: event.wins + 1, started_at: now };
    this.eventRoundStats = { games: 1, wins: 0, draws: 0, losses: 0, moves: 0, last_move: null };
    this.opponent = { opponent_id: opponent.id, opponent_name: opponent.name, opponent_role: "Daily lava climber", portrait: opponent.portrait };
    this.matchScore = createMatchScore();
    this.resultRecorded = false;
    this.roundId += 1;
    this.gameStarted = true;
    this.model.reset();
    this.view.showGame?.();
    this.view.focusFirstCell?.();
    this.render();
    return true;
  }

  isCurrentRound(roundId) {
    return this.gameStarted && this.roundId === roundId;
  }

  isMatchOver() {
    return Object.values(this.matchScore).some((score) => score >= MATCH_POINTS_TO_WIN);
  }

  showResult() {
    this.view.openResultDialog(this.model.getState());
  }
}

export { AI_MOVE_DELAY, MATCHMAKING_DURATION, MATCH_POINTS_TO_WIN, COMPUTER_OPPONENT, createMatchScore };
