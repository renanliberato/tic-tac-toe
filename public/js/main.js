import { createGame, makeMove } from "./game.js";

const homeScreen = document.querySelector("#home-screen");
const gameScreen = document.querySelector("#game-screen");
const start = document.querySelector("#start-game");
const cells = [...document.querySelectorAll("[data-cell]")];
const status = document.querySelector("#status");
const matchmakingDialog = document.querySelector("#matchmaking-dialog");
const resultDialog = document.querySelector("#result-dialog");
const resultMessage = document.querySelector("#result-message");
const continueButton = document.querySelector("#continue");
const MATCHMAKING_DURATION = 3000;
let game = createGame();
let gameStarted = false;
let matchmakingTimer = null;

function render() {
  cells.forEach((cell, index) => {
    cell.textContent = game.board[index] || "";
    cell.disabled = !gameStarted || Boolean(game.board[index]) || Boolean(game.winner) || game.draw;
  });

  status.textContent = game.winner
    ? `Player ${game.winner} wins!`
    : game.draw
      ? "It's a draw!"
      : `Player ${game.player}'s turn`;

  if ((game.winner || game.draw) && resultDialog && !resultDialog.open) {
    resultMessage.textContent = game.winner ? `${game.winner} Won` : "Draw";
    openResultDialog();
  }
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

function openMatchmakingDialog() {
  if (!matchmakingDialog) return;

  if (typeof matchmakingDialog.showModal === "function") {
    try {
      matchmakingDialog.showModal();
      return;
    } catch {
      // jsdom does not implement showModal; the open attribute is a useful fallback.
    }
  }

  matchmakingDialog.setAttribute("open", "");
}

function closeMatchmakingDialog() {
  if (!matchmakingDialog) return;

  if (typeof matchmakingDialog.close === "function") {
    matchmakingDialog.close();
  } else {
    matchmakingDialog.removeAttribute("open");
  }
}

function stopMatchmaking() {
  if (matchmakingTimer !== null) {
    globalThis.clearTimeout(matchmakingTimer);
    matchmakingTimer = null;
  }
  closeMatchmakingDialog();
}

function showGame() {
  stopMatchmaking();
  closeResultDialog();
  game = createGame();
  gameStarted = true;
  homeScreen.hidden = true;
  gameScreen.hidden = false;
  render();
  cells[0].focus();
}

function showHome() {
  stopMatchmaking();
  closeResultDialog();
  game = createGame();
  gameStarted = false;
  homeScreen.hidden = false;
  gameScreen.hidden = true;
  render();
  start.focus();
}

cells.forEach((cell, index) => {
  cell.addEventListener("click", () => {
    game = makeMove(game, index);
    render();
  });
});

function startMatchmaking() {
  if (matchmakingTimer !== null) return;

  closeResultDialog();
  game = createGame();
  gameStarted = false;
  homeScreen.hidden = true;
  gameScreen.hidden = true;
  render();
  openMatchmakingDialog();

  matchmakingTimer = globalThis.setTimeout(() => {
    matchmakingTimer = null;
    showGame();
  }, MATCHMAKING_DURATION);
}

start.addEventListener("click", startMatchmaking);
continueButton?.addEventListener("click", showHome);
matchmakingDialog?.addEventListener("cancel", (event) => {
  event.preventDefault();
});
resultDialog?.addEventListener("cancel", (event) => {
  event.preventDefault();
});

render();
