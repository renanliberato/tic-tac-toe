import { getWinningLine } from "./game.js";
import { createOpponent } from "./identity.js";
import {
  getOrCreatePlayer,
  startPlayerGame,
  updatePlayerAfterMove,
  updatePlayerAfterResult,
  awardCoins,
  consumePendingCoins,
  claimDailyGift,
  readLatestPlayer,
  PLAYER_STORAGE_KEY
} from "./player.js";

const MATCHMAKING_DURATION = 3000;
const MATCH_POINTS_TO_WIN = 3;

function createMatchScore() {
  return { X: 0, O: 0 };
}

/**
 * Coordinates user actions and application state without directly touching
 * the DOM. The controller is the glue between the model and the view.
 */
export class GameController {
  constructor(model, view, timer = globalThis) {
    this.model = model;
    this.view = view;
    this.timer = timer;
    this.gameStarted = false;
    this.matchmakingTimer = null;
    this.player = getOrCreatePlayer();
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
    this.view.onStart(() => this.startMatchmaking());
    this.view.cells.forEach((_, index) => {
      this.view.onCell(index, () => this.play(index));
    });
    this.view.onContinue(() => this.showHome());
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
      this.matchScore
    );
  }

  play(index) {
    if (!this.gameStarted || !this.model.makeMove(index)) return;

    this.player = updatePlayerAfterMove(this.player, this.model.getState(), index);
    const state = this.model.getState();
    const completedRoundId = this.roundId;
    this.recordResult(state);
    this.view.replayMove(index);

    if (state.winner) {
      const finalRound = this.matchScore[state.winner] >= MATCH_POINTS_TO_WIN;
      this.view.animateWinningLine(getWinningLine(state.board)).then(() => {
        if (!this.isCurrentRound(completedRoundId)) return;
        if (finalRound) {
          this.showResult();
        } else {
          this.startNextRound(completedRoundId);
        }
      });
    } else if (state.draw) {
      this.startNextRound(completedRoundId);
    }
  }

  startMatchmaking() {
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
    this.stopMatchmaking();
    this.view.closeResultDialog();
    this.view.resetFeedback();
    this.gameStarted = true;
    this.matchScore = createMatchScore();
    this.resultRecorded = false;
    this.roundId += 1;
    // startGame can also be called directly by an integration, so keep every
    // actual game covered even when matchmaking was skipped.
    this.opponent ||= createOpponent();
    this.player = startPlayerGame(this.player);
    this.view.showGame();
    this.model.reset();
    this.view.focusFirstCell();
  }

  startNextRound(completedRoundId) {
    if (!this.isCurrentRound(completedRoundId) || this.isMatchOver()) return;

    this.view.resetFeedback();
    this.resultRecorded = false;
    this.roundId += 1;
    this.player = startPlayerGame(this.player);
    this.model.reset();
    this.view.focusFirstCell();
  }

  showHome() {
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
      // A startup backlog is intentionally combined. During an active in-session
      // presentation only the new gift is queued as a separate celebration.
      const amount = this.coinPresentationActive ? result.amount : priorPending + result.amount;
      this.queueCoinPresentation(amount);
    };
    const animation = this.view.animateDailyGiftClaim?.(this.player.daily_gift);
    if (animation?.then) animation.then(finish);
    else finish();
  }

  enterHomePresentation() {
    const unscheduled = Math.max(0, this.player.pending_coins - this.scheduledPendingCoins);
    if (unscheduled > 0) this.queueCoinPresentation(unscheduled);
    else if (!this.coinPresentationActive) this.view.renderCoinBalance?.(this.player.coin_balance);
  }

  queueCoinPresentation(amount) {
    if (!Number.isInteger(amount) || amount <= 0) return;
    this.scheduledPendingCoins += amount;
    if (this.coinPresentationActive) {
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
      const next = this.coinPresentationQueue.shift();
      if (next) this.startCoinPresentation(next);
    };
    if (this.view.enterHome) this.view.enterHome(presentation, complete);
    else complete();
  }

  bindStorageSync() {
    const windowRef = this.view.document?.defaultView;
    windowRef?.addEventListener?.("storage", (event) => {
      if (event.key !== PLAYER_STORAGE_KEY) return;
      const latest = readLatestPlayer();
      if (!latest || latest.player_id !== this.player.player_id) return;
      this.player = latest;
      this.view.renderDailyGift?.(latest.daily_gift);
      if (!this.coinPresentationActive) this.view.renderCoinBalance?.(latest.coin_balance);
      if (latest.daily_gift.claimed && this.view.dailyGiftMode === "claimable") {
        this.view.closeDailyGift?.();
      }
    });
  }

  stopMatchmaking() {
    if (this.matchmakingTimer !== null) {
      this.timer.clearTimeout(this.matchmakingTimer);
      this.matchmakingTimer = null;
    }
    this.view.closeMatchmakingDialog();
  }

  recordResult(state) {
    if (this.resultRecorded || (!state.winner && !state.draw)) return;

    const matchWinner = state.winner
      && this.matchScore[state.winner] + 1 >= MATCH_POINTS_TO_WIN;
    this.player = updatePlayerAfterResult(this.player, state);
    if (state.winner) {
      this.matchScore = {
        ...this.matchScore,
        [state.winner]: this.matchScore[state.winner] + 1
      };
    }
    if (matchWinner && state.winner === "X") {
      this.player = awardCoins(this.player, 3);
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

export { MATCHMAKING_DURATION, MATCH_POINTS_TO_WIN, createMatchScore };
