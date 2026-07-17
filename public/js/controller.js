import { getWinningLine } from "./game.js";
import {
  getOrCreatePlayer,
  startPlayerGame,
  updatePlayerAfterMove,
  updatePlayerAfterResult,
  awardCoins,
  consumePendingCoins
} from "./player.js";

const AI_MOVE_DELAY = 500;
const MATCH_POINTS_TO_WIN = 3;
const COMPUTER_OPPONENT = Object.freeze({
  opponent_id: "computer",
  opponent_name: "Computer",
  opponent_role: "AI Opponent"
});

function createMatchScore() {
  return { X: 0, O: 0 };
}

/** Coordinates user actions and application state without touching the DOM. */
export class GameController {
  constructor(model, view, timer = globalThis, random = Math.random) {
    this.model = model;
    this.view = view;
    this.timer = timer;
    this.random = random;
    this.gameStarted = false;
    this.aiTimer = null;
    this.aiPending = false;
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
    this.view.onStart(() => this.startGame());
    this.view.cells.forEach((_, index) => {
      this.view.onCell(index, () => this.play(index));
    });
    this.view.onContinue(() => this.showHome());
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

    // Set this before makeMove notifies the view so there is never an unlocked
    // render between the human move and the computer delay.
    this.aiPending = true;
    if (!this.model.makeMove(index)) {
      this.aiPending = false;
      this.render();
      return;
    }

    this.player = updatePlayerAfterMove(this.player, this.model.getState(), index);
    const acceptedState = this.model.getState();
    const terminal = Boolean(acceptedState.winner || acceptedState.draw);
    this.finishMove(index);

    if (terminal) {
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

      const randomValue = Number(this.random());
      const randomIndex = Number.isFinite(randomValue)
        ? Math.min(freeCells.length - 1, Math.max(0, Math.floor(randomValue * freeCells.length)))
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

  // Retained as a compatibility alias for integrations that used the old
  // entry point. Local games no longer enter or wait in a matchmaking queue.
  startMatchmaking() {
    this.startGame();
  }

  startGame() {
    this.view.finishCoinPresentation?.();
    this.cancelComputerMove();
    this.view.closeResultDialog();
    this.view.resetFeedback();
    this.gameStarted = true;
    this.opponent = COMPUTER_OPPONENT;
    this.matchScore = createMatchScore();
    this.resultRecorded = false;
    this.roundId += 1;
    this.player = startPlayerGame(this.player);
    this.view.showGame();
    this.model.reset();
    this.view.focusFirstCell();
  }

  startNextRound(completedRoundId) {
    if (!this.isCurrentRound(completedRoundId) || this.isMatchOver()) return;

    this.cancelComputerMove();
    this.view.resetFeedback();
    this.resultRecorded = false;
    this.roundId += 1;
    this.player = startPlayerGame(this.player);
    this.model.reset();
    this.view.focusFirstCell();
  }

  showHome() {
    this.cancelComputerMove();
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
    this.player = updatePlayerAfterResult(this.player, state);
    if (state.winner) {
      this.matchScore = {
        ...this.matchScore,
        [state.winner]: this.matchScore[state.winner] + 1
      };
    }
    if (matchWinner && state.winner === "X") this.player = awardCoins(this.player, 3);
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

export { AI_MOVE_DELAY, MATCH_POINTS_TO_WIN, COMPUTER_OPPONENT, createMatchScore };
