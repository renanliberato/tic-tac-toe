import { getWinningLine } from "./game.js";
import {
  awardLeaderboardPoint,
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
    this.scheduledPendingCoins = 0;
    this.startupGiftHandled = false;

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
    this.view.onContinue(() => this.showHome());
    this.view.onLeaderboardOpen?.(() => this.showLeaderboard());
    this.view.onLeaderboardBack?.(() => this.leaveLeaderboard());
    this.view.onLeaderboardRefresh?.((fromStorage = false) =>
      this.refreshLeaderboardPlayer(fromStorage));
    this.view.onProfile?.(() => this.showProfile());
    this.view.onProfileBack?.(() => this.showHomeFromProfile());
    this.view.onStyles?.(() => this.showStyles());
    this.view.onStylesBack?.(() => this.showProfileFromStyles());
    this.view.onStyle?.((styleId, tile) => this.activateStyle(styleId, tile));
    this.view.onDailyGiftOpen?.(() => this.openDailyGift(this.view.dailyGiftLauncher));
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
    this.player = updatePlayerAfterMove(
      this.player, this.model.getState(), index, undefined, this.now()
    );
    const acceptedState = this.model.getState();
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
    this.startGame();
  }

  startGame() {
    this.view.finishCoinPresentation?.();
    this.cancelComputerMove();
    this.view.closeMatchmakingDialog?.();
    this.view.closeResultDialog();
    this.view.resetFeedback();
    this.gameStarted = true;
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
    this.player = startPlayerGame(this.player, undefined, this.now());
    this.model.reset();
    this.view.focusFirstCell();
  }

  showHome() {
    this.cancelComputerMove();
    this.view.stopLeaderboard?.();
    this.stopMatchmaking();
    this.view.resetFeedback();
    this.opponent = null;
    this.view.closeResultDialog();
    this.gameStarted = false;
    this.roundId += 1;
    this.model.reset();
    this.view.showHome();
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

  enterHomePresentation() {
    const unscheduled = Math.max(0, this.player.pending_coins - this.scheduledPendingCoins);
    if (unscheduled > 0) this.queueCoinPresentation(unscheduled);
    else if (!this.coinPresentationActive) this.view.renderCoinBalance?.(this.player.coin_balance);
  }

  queueCoinPresentation(amount) {
    if (!Number.isInteger(amount) || amount <= 0) return;
    this.scheduledPendingCoins += amount;
    if (this.coinPresentationActive) { this.coinPresentationQueue.push(amount); return; }
    this.startCoinPresentation(amount);
  }

  startCoinPresentation(amount) {
    this.coinPresentationActive = true;
    const presentation = { ...this.player, pending_coins: amount };
    const complete = () => {
      this.player = consumePendingCoins(this.player, undefined, amount);
      this.scheduledPendingCoins = Math.max(0, this.scheduledPendingCoins - amount);
      this.coinPresentationActive = false;
      const next = this.coinPresentationQueue.shift();
      if (next) this.startCoinPresentation(next);
      else this.enterHomePresentation();
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
      this.view.renderDailyGift?.(latest.daily_gift);
      if (!this.coinPresentationActive) this.view.renderCoinBalance?.(latest.coin_balance);
      if (latest.daily_gift.claimed && this.view.dailyGiftMode === "claimable") this.view.closeDailyGift?.();
    });
  }

  showLeaderboard() {
    this.player = this.refreshLeaderboardPlayer();
    this.view.showLeaderboard(this.player, this.now());
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

    const matchWinner = state.winner
      && this.matchScore[state.winner] + 1 >= MATCH_POINTS_TO_WIN;
    this.player = updatePlayerAfterResult(this.player, state, undefined, this.now());
    if (state.winner) {
      const decisiveLocalWin = state.winner === "X"
        && this.matchScore.X === MATCH_POINTS_TO_WIN - 1;
      this.matchScore = {
        ...this.matchScore,
        [state.winner]: this.matchScore[state.winner] + 1
      };
      if (decisiveLocalWin) {
        this.player = awardLeaderboardPoint(this.player, this.now());
      }
    }
    if (matchWinner) {
      this.player = updatePlayerAfterMatch(this.player, state.winner, undefined, this.now());
      if (state.winner === "X") {
        this.player = awardCoins(
          this.player,
          this.player.win_streak === 3 ? 4 : 3,
          undefined,
          this.now()
        );
      }
    }
    this.resultRecorded = true;
    this.render();
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
