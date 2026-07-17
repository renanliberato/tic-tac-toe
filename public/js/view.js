import { applyPageScale } from "./layout.js";

const WINNING_LINE_DURATION = 700;

const WINNING_LINE_CLASSES = {
  "0,1,2": "winning-line--row-0",
  "3,4,5": "winning-line--row-1",
  "6,7,8": "winning-line--row-2",
  "0,3,6": "winning-line--column-0",
  "1,4,7": "winning-line--column-1",
  "2,5,8": "winning-line--column-2",
  "0,4,8": "winning-line--diagonal-main",
  "2,4,6": "winning-line--diagonal-reverse"
};

/**
 * DOM view for the game. It translates state and controller commands into
 * markup, classes, focus changes, and visual feedback.
 */
export class GameView {
  constructor(documentRef = globalThis.document) {
    this.document = documentRef;
    this.gameRoot = documentRef.querySelector(".game");
    this.homeScreen = documentRef.querySelector("#home-screen");
    this.gameScreen = documentRef.querySelector("#game-screen");
    this.start = documentRef.querySelector("#start-game");
    this.cells = [...documentRef.querySelectorAll("[data-cell]")];
    this.board = documentRef.querySelector(".board");
    this.status = documentRef.querySelector("#status");
    this.playerPanel = documentRef.querySelector("[data-player=\"local\"]");
    this.playerName = documentRef.querySelector("#player-name");
    this.opponentName = documentRef.querySelector("#opponent-name");
    this.opponentPanel = documentRef.querySelector("[data-player=\"opponent\"]");
    this.matchmakingDialog = documentRef.querySelector("#matchmaking-dialog");
    this.resultDialog = documentRef.querySelector("#result-dialog");
    this.resultMessage = documentRef.querySelector("#result-message");
    this.resultDetail = documentRef.querySelector("#result-detail");
    this.continueButton = documentRef.querySelector("#continue");
    this.winningLineElement = this.board?.querySelector("[data-winning-line]");
    this.winningAnimationId = 0;
    this.winningAnimationTimer = null;
    this.winningAnimationCleanup = null;

    if (!this.winningLineElement && this.board) {
      this.winningLineElement = documentRef.createElement("span");
      this.winningLineElement.className = "winning-line";
      this.winningLineElement.dataset.winningLine = "";
      this.winningLineElement.setAttribute("aria-hidden", "true");
      this.board.append(this.winningLineElement);
    }

    applyPageScale(this.gameRoot, documentRef.defaultView);
  }

  onStart(handler) {
    this.start?.addEventListener("click", handler);
  }

  onCell(index, handler) {
    this.cells[index]?.addEventListener("click", handler);
  }

  onContinue(handler) {
    this.continueButton?.addEventListener("click", handler);
  }

  preventDialogDismissal(dialog) {
    dialog?.addEventListener("cancel", (event) => {
      event.preventDefault();
    });
  }

  bindDialogGuards() {
    this.preventDialogDismissal(this.matchmakingDialog);
    this.preventDialogDismissal(this.resultDialog);
  }

  render(state, gameStarted, winningLine = [], player = null, opponent = null) {
    this.renderPlayers(player, opponent, state, gameStarted);
    this.cells.forEach((cell, index) => {
      const mark = state.board[index] || "";
      cell.textContent = mark;
      cell.dataset.mark = mark;
      cell.classList.toggle("cell--placed", Boolean(mark));
      cell.classList.toggle("cell--winner", winningLine.includes(index));
      cell.setAttribute("aria-label", mark
        ? `Cell ${index + 1}, ${mark}`
        : `Cell ${index + 1}`);
      cell.disabled = !gameStarted || Boolean(mark) || Boolean(state.winner) || state.draw;
    });

    this.status.textContent = state.winner
      ? `Player ${state.winner} wins!`
      : state.draw
        ? "It\'s a draw!"
        : "";
    this.status.classList.toggle("status--winner", Boolean(state.winner));
    this.status.classList.toggle("status--draw", state.draw);
    this.board?.classList.toggle("board--winner", Boolean(state.winner));
    this.board?.classList.toggle("board--draw", state.draw);
    this.gameRoot?.classList.toggle("game--celebrating", Boolean(state.winner || state.draw));

    if (this.winningLineElement) {
      this.winningLineElement.hidden = !state.winner;
      if (state.winner) this.setWinningLine(this.winningLineElement, winningLine);
    }
  }

  renderPlayers(player, opponent, state, gameStarted) {
    if (this.playerName) this.playerName.textContent = player?.player_name || "You";
    if (this.opponentName) this.opponentName.textContent = opponent?.opponent_name || "";

    if (this.opponentPanel) {
      this.opponentPanel.hidden = !opponent;
      this.opponentPanel.dataset.playerId = opponent?.opponent_id || "";
      this.opponentPanel.dataset.opponentId = opponent?.opponent_id || "";
    }

    const turnIsActive = gameStarted && !state?.winner && !state?.draw;
    this.setTurnIndicator(this.playerPanel, turnIsActive && state?.player === this.getPanelMark(this.playerPanel, "X"));
    this.setTurnIndicator(this.opponentPanel, turnIsActive && Boolean(opponent)
      && state?.player === this.getPanelMark(this.opponentPanel, "O"));
  }

  getPanelMark(panel, fallback) {
    return panel?.dataset.mark || fallback;
  }

  setTurnIndicator(panel, isActive) {
    if (!panel) return;

    panel.classList.toggle("player-card--active", isActive);
    if (isActive) {
      panel.setAttribute("aria-current", "true");
    } else {
      panel.removeAttribute("aria-current");
    }
  }

  replayAnimation(element, className) {
    if (!element) return;

    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  }

  replayMove(index) {
    this.replayAnimation(this.cells[index], "cell--placed");
    this.replayAnimation(this.status, "status--updated");
  }

  getWinningLineClass(line) {
    return WINNING_LINE_CLASSES[line.join(",")] || "";
  }

  setWinningLine(element, line) {
    if (!line?.length) return;

    element.className = `winning-line ${this.getWinningLineClass(line)}`;
    element.dataset.line = line.join(",");
    element.style.color = this.cells[line[0]]?.dataset.mark === "X" ? "#b42318" : "#175cd3";

    const firstCell = this.cells[line[0]];
    const lastCell = this.cells[line[line.length - 1]];
    const firstCenter = this.getCellCenter(firstCell);
    const lastCenter = this.getCellCenter(lastCell);

    if (firstCenter && lastCenter) {
      const width = Math.hypot(lastCenter.x - firstCenter.x, lastCenter.y - firstCenter.y);
      const angle = Math.atan2(lastCenter.y - firstCenter.y, lastCenter.x - firstCenter.x);

      element.style.left = `${firstCenter.x}px`;
      element.style.top = `${firstCenter.y}px`;
      element.style.width = `${width}px`;
      element.style.setProperty("--winning-line-angle", `${angle}rad`);
    } else {
      element.style.removeProperty("left");
      element.style.removeProperty("top");
      element.style.removeProperty("width");
      element.style.removeProperty("--winning-line-angle");
    }
  }

  getCellCenter(cell) {
    if (!cell || cell.offsetParent !== this.board || !cell.offsetWidth || !cell.offsetHeight) {
      return null;
    }

    return {
      x: cell.offsetLeft + cell.offsetWidth / 2,
      y: cell.offsetTop + cell.offsetHeight / 2
    };
  }

  cancelWinningLine() {
    this.winningAnimationId += 1;

    if (this.winningAnimationTimer !== null) {
      globalThis.clearTimeout(this.winningAnimationTimer);
      this.winningAnimationTimer = null;
    }
    this.winningAnimationCleanup?.();
    this.winningAnimationCleanup = null;

    if (this.winningLineElement) {
      this.winningLineElement.classList.remove("winning-line--active");
      this.winningLineElement.hidden = true;
    }
  }

  animateWinningLine(line) {
    if (!this.winningLineElement || !line?.length) return Promise.resolve();

    this.cancelWinningLine();
    const animationId = this.winningAnimationId;
    this.setWinningLine(this.winningLineElement, line);
    this.winningLineElement.hidden = false;
    const winningAnimationElement = this.winningLineElement;

    return new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished || animationId !== this.winningAnimationId) return;
        finished = true;
        if (this.winningAnimationTimer !== null) {
          globalThis.clearTimeout(this.winningAnimationTimer);
          this.winningAnimationTimer = null;
        }
        winningAnimationElement.removeEventListener("animationend", finish);
        this.winningAnimationCleanup = null;
        resolve();
      };

      this.winningAnimationCleanup = () => {
        winningAnimationElement.removeEventListener("animationend", finish);
        finished = true;
      };
      winningAnimationElement.addEventListener("animationend", finish);
      winningAnimationElement.classList.remove("winning-line--active");
      void winningAnimationElement.offsetWidth;
      winningAnimationElement.classList.add("winning-line--active");
      this.winningAnimationTimer = globalThis.setTimeout(finish, WINNING_LINE_DURATION);
    });
  }

  showHome() {
    this.homeScreen.hidden = false;
    this.gameScreen.hidden = true;
    this.start?.focus();
  }

  showMatchmaking() {
    this.homeScreen.hidden = true;
    this.gameScreen.hidden = true;
  }

  showGame() {
    this.homeScreen.hidden = true;
    this.gameScreen.hidden = false;
    this.cells[0]?.focus();
  }

  openResultDialog(state) {
    if ((!state.winner && !state.draw) || !this.resultDialog || this.resultDialog.open) return;

    this.resultMessage.textContent = state.winner ? `${state.winner} Won` : "Draw";
    if (this.resultDetail) {
      this.resultDetail.textContent = state.winner
        ? "Three in a row!"
        : "No spaces left on the board.";
    }
    this.openDialog(this.resultDialog, this.continueButton);
  }

  closeResultDialog() {
    this.closeDialog(this.resultDialog);
  }

  openMatchmakingDialog() {
    this.openDialog(this.matchmakingDialog);
  }

  closeMatchmakingDialog() {
    this.closeDialog(this.matchmakingDialog);
  }

  openDialog(dialog, focusTarget) {
    if (!dialog) return;

    if (typeof dialog.showModal === "function") {
      try {
        dialog.showModal();
        focusTarget?.focus();
        return;
      } catch {
        // jsdom does not implement showModal; the open attribute is a fallback.
      }
    }

    dialog.setAttribute("open", "");
    focusTarget?.focus();
  }

  closeDialog(dialog) {
    if (!dialog) return;

    if (typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }

  resetFeedback() {
    this.cancelWinningLine();
    this.gameRoot?.classList.remove("game--celebrating");
    this.board?.classList.remove("board--winner", "board--draw");
    this.status.classList.remove("status--winner", "status--draw", "status--updated");
  }
}

export { WINNING_LINE_DURATION };
