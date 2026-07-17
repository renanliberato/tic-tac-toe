import { getWinningLine } from "./game.js";
import { createOpponent } from "./identity.js";
import {
  getOrCreatePlayer,
  startPlayerGame,
  updatePlayerAfterMove,
  updatePlayerAfterResult,
  awardCoins,
  consumePendingCoins,
  activatePlayerStyle
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

    this.model.subscribe(() => this.render());
    this.bindViewEvents();
    this.view.bindDialogGuards();
    this.render();
    this.enterHomePresentation();
  }

  bindViewEvents() {
    this.view.onStart(() => this.startMatchmaking());
    this.view.cells.forEach((_, index) => {
      this.view.onCell(index, () => this.play(index));
    });
    this.view.onContinue(() => this.showHome());
    this.view.onProfile?.(() => this.showProfile());
    this.view.onProfileBack?.(() => this.showHomeFromProfile());
    this.view.onStyles?.(() => this.showStyles());
    this.view.onStylesBack?.(() => this.showProfileFromStyles());
    this.view.onStyle?.((styleId, tile) => this.activateStyle(styleId, tile));
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

  enterHomePresentation() {
    this.view.enterHome?.(this.player, () => {
      this.player = consumePendingCoins(this.player);
    });
  }

  showProfile() {
    this.view.finishCoinPresentation?.();
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
