import { getWinningLine } from "./game.js";

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
    this.view.render(state, this.gameStarted, winningLine);
  }

  play(index) {
    if (!this.gameStarted || !this.model.makeMove(index)) return;

    this.view.replayMove(index);
    const state = this.model.getState();
    if (state.winner) {
      this.view.animateWinningLine(getWinningLine(state.board)).then(() => this.showResult());
    } else if (state.draw) {
      this.showResult();
    }
  }

  startMatchmaking() {
    if (this.matchmakingTimer !== null) return;

    this.view.closeResultDialog();
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
    this.model.reset();
    this.view.showGame();
    this.render();
  }

  showHome() {
    this.stopMatchmaking();
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

  showResult() {
    this.view.openResultDialog(this.model.getState());
  }
}

export { MATCHMAKING_DURATION };
