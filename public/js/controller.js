import { getWinningLine } from "./game.js";
import { createOpponent } from "./identity.js";
import {
  getOrCreatePlayer,
  startPlayerGame,
  updatePlayerAfterMove,
  updatePlayerAfterResult
} from "./player.js";

const MATCHMAKING_DURATION = 3000;

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
    this.resultRecorded = false;

    this.model.subscribe(() => this.render());
    this.bindViewEvents();
    this.view.bindDialogGuards();
    this.render();
  }

  bindViewEvents() {
    this.view.onStart(() => this.startMatchmaking());
    this.view.cells.forEach((_, index) => {
      this.view.onCell(index, () => this.play(index));
    });
    this.view.onContinue(() => this.showHome());
  }

  render() {
    const state = this.model.getState();
    const winningLine = state.winner ? getWinningLine(state.board) || [] : [];
    this.view.render(state, this.gameStarted, winningLine, this.player, this.opponent);
  }

  play(index) {
    if (!this.gameStarted || !this.model.makeMove(index)) return;

    this.player = updatePlayerAfterMove(this.player, this.model.getState(), index);
    const state = this.model.getState();
    this.recordResult(state);
    this.view.replayMove(index);
    if (state.winner) {
      this.view.animateWinningLine(getWinningLine(state.board)).then(() => this.showResult());
    } else if (state.draw) {
      this.showResult();
    }
  }

  startMatchmaking() {
    if (this.matchmakingTimer !== null) return;

    this.view.closeResultDialog();
    this.opponent = createOpponent();
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
    this.resultRecorded = false;
    // startGame can also be called directly by an integration, so keep every
    // actual game covered even when matchmaking was skipped.
    this.opponent ||= createOpponent();
    this.player = startPlayerGame(this.player);
    this.model.reset();
    this.view.showGame();
    this.render();
  }

  showHome() {
    this.stopMatchmaking();
    this.opponent = null;
    this.view.closeResultDialog();
    this.view.resetFeedback();
    this.gameStarted = false;
    this.model.reset();
    this.view.showHome();
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

    this.player = updatePlayerAfterResult(this.player, state);
    this.resultRecorded = true;
  }

  showResult() {
    this.view.openResultDialog(this.model.getState());
  }
}

export { MATCHMAKING_DURATION };
