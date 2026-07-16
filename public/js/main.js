import { createGame, getWinningLine, makeMove } from "./game.js";

const gameRoot = document.querySelector(".game");
const homeScreen = document.querySelector("#home-screen");
const gameScreen = document.querySelector("#game-screen");
const start = document.querySelector("#start-game");
const cells = [...document.querySelectorAll("[data-cell]")];
const board = document.querySelector(".board");
const status = document.querySelector("#status");
const resultDialog = document.querySelector("#result-dialog");
const resultMessage = document.querySelector("#result-message");
const resultDetail = document.querySelector("#result-detail");
const continueButton = document.querySelector("#continue");
let game = createGame();
let gameStarted = false;

function render() {
  const winningLine = game.winner ? getWinningLine(game.board) || [] : [];

  cells.forEach((cell, index) => {
    const mark = game.board[index] || "";
    cell.textContent = mark;
    cell.dataset.mark = mark;
    cell.classList.toggle("cell--placed", Boolean(mark));
    cell.classList.toggle("cell--winner", winningLine.includes(index));
    cell.setAttribute("aria-label", mark
      ? `Cell ${index + 1}, ${mark}`
      : `Cell ${index + 1}`);
    cell.disabled = !gameStarted || Boolean(mark) || Boolean(game.winner) || game.draw;
  });

  status.textContent = game.winner
    ? `Player ${game.winner} wins!`
    : game.draw
      ? "It\'s a draw!"
      : `Player ${game.player}\'s turn`;
  status.classList.toggle("status--winner", Boolean(game.winner));
  status.classList.toggle("status--draw", game.draw);
  board?.classList.toggle("board--winner", Boolean(game.winner));
  board?.classList.toggle("board--draw", game.draw);
  gameRoot?.classList.toggle("game--celebrating", Boolean(game.winner || game.draw));

  if ((game.winner || game.draw) && resultDialog && !resultDialog.open) {
    resultMessage.textContent = game.winner ? `${game.winner} Won` : "Draw";
    if (resultDetail) {
      resultDetail.textContent = game.winner
        ? "Three in a row!"
        : "No spaces left on the board.";
    }
    openResultDialog();
  }
}

function replayAnimation(element, className) {
  if (!element) return;

  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function openResultDialog() {
  if (typeof resultDialog.showModal === "function") {
    try {
      resultDialog.showModal();
      continueButton.focus();
      return;
    } catch {
      // jsdom does not implement showModal; the open attribute is a useful fallback.
    }
  }

  resultDialog.setAttribute("open", "");
  continueButton.focus();
}

function closeResultDialog() {
  if (!resultDialog) return;

  if (typeof resultDialog.close === "function") {
    resultDialog.close();
  } else {
    resultDialog.removeAttribute("open");
  }
}

function resetFeedback() {
  gameRoot?.classList.remove("game--celebrating");
  board?.classList.remove("board--winner", "board--draw");
  status.classList.remove("status--winner", "status--draw", "status--updated");
}

function showGame() {
  closeResultDialog();
  resetFeedback();
  game = createGame();
  gameStarted = true;
  homeScreen.hidden = true;
  gameScreen.hidden = false;
  render();
  cells[0]?.focus();
}

function showHome() {
  closeResultDialog();
  resetFeedback();
  game = createGame();
  gameStarted = false;
  homeScreen.hidden = false;
  gameScreen.hidden = true;
  render();
  start.focus();
}

cells.forEach((cell, index) => {
  cell.addEventListener("click", () => {
    const previousGame = game;
    game = makeMove(game, index);

    if (game === previousGame) return;

    render();
    replayAnimation(cell, "cell--placed");
    replayAnimation(status, "status--updated");
  });
});

start.addEventListener("click", showGame);
continueButton?.addEventListener("click", showHome);
resultDialog?.addEventListener("cancel", (event) => {
  event.preventDefault();
});

render();
