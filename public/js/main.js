import { createGame, getWinningLine, makeMove } from "./game.js";
import { applyPageScale } from "./layout.js";
import {
  getOrCreatePlayer,
  startPlayerGame,
  updatePlayerAfterMove,
  updatePlayerAfterResult
} from "./player.js";

const gameRoot = document.querySelector(".game");
const homeScreen = document.querySelector("#home-screen");
const gameScreen = document.querySelector("#game-screen");
const start = document.querySelector("#start-game");
const cells = [...document.querySelectorAll("[data-cell]")];
const board = document.querySelector(".board");
const status = document.querySelector("#status");
const matchmakingDialog = document.querySelector("#matchmaking-dialog");
const resultDialog = document.querySelector("#result-dialog");
const resultMessage = document.querySelector("#result-message");
const resultDetail = document.querySelector("#result-detail");
const continueButton = document.querySelector("#continue");
const WINNING_LINE_DURATION = 700;
const MATCHMAKING_DURATION = 3000;
let winningLineElement = board?.querySelector("[data-winning-line]");
let winningAnimationId = 0;
let winningAnimationTimer = null;
let winningAnimationCleanup = null;

if (!winningLineElement && board) {
  winningLineElement = document.createElement("span");
  winningLineElement.className = "winning-line";
  winningLineElement.dataset.winningLine = "";
  winningLineElement.setAttribute("aria-hidden", "true");
  board.append(winningLineElement);
}
let game = createGame();
let player = getOrCreatePlayer();
let gameStarted = false;
let matchmakingTimer = null;

applyPageScale(gameRoot, document.defaultView);

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
      ? "It's a draw!"
      : `Player ${game.player}'s turn`;
  status.classList.toggle("status--winner", Boolean(game.winner));
  status.classList.toggle("status--draw", game.draw);
  board?.classList.toggle("board--winner", Boolean(game.winner));
  board?.classList.toggle("board--draw", game.draw);
  gameRoot?.classList.toggle("game--celebrating", Boolean(game.winner || game.draw));

  if (winningLineElement) {
    winningLineElement.hidden = !game.winner;
    if (game.winner) setWinningLine(winningLineElement, winningLine);
  }
}

function replayAnimation(element, className) {
  if (!element) return;

  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function getWinningLineClass(line) {
  const lineKey = line.join(",");
  const classes = {
    "0,1,2": "winning-line--row-0",
    "3,4,5": "winning-line--row-1",
    "6,7,8": "winning-line--row-2",
    "0,3,6": "winning-line--column-0",
    "1,4,7": "winning-line--column-1",
    "2,5,8": "winning-line--column-2",
    "0,4,8": "winning-line--diagonal-main",
    "2,4,6": "winning-line--diagonal-reverse"
  };
  return classes[lineKey] || "";
}

function setWinningLine(element, line) {
  if (!line?.length) return;

  element.className = `winning-line ${getWinningLineClass(line)}`;
  element.dataset.line = line.join(",");
  element.style.color = cells[line[0]]?.dataset.mark === "X" ? "#b42318" : "#175cd3";

  const firstCell = cells[line[0]];
  const lastCell = cells[line[line.length - 1]];
  const firstCenter = getCellCenter(firstCell);
  const lastCenter = getCellCenter(lastCell);

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

function getCellCenter(cell) {
  if (!cell || cell.offsetParent !== board || !cell.offsetWidth || !cell.offsetHeight) return null;

  return {
    x: cell.offsetLeft + cell.offsetWidth / 2,
    y: cell.offsetTop + cell.offsetHeight / 2
  };
}

function cancelWinningLine() {
  winningAnimationId += 1;

  if (winningAnimationTimer !== null) {
    globalThis.clearTimeout(winningAnimationTimer);
    winningAnimationTimer = null;
  }
  winningAnimationCleanup?.();
  winningAnimationCleanup = null;

  if (winningLineElement) {
    winningLineElement.classList.remove("winning-line--active");
    winningLineElement.hidden = true;
  }
}

function animateWinningLine(line) {
  if (!winningLineElement || !line?.length) return Promise.resolve();

  cancelWinningLine();
  const animationId = winningAnimationId;
  setWinningLine(winningLineElement, line);
  winningLineElement.hidden = false;
  const winningAnimationElement = winningLineElement;

  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished || animationId !== winningAnimationId) return;
      finished = true;
      if (winningAnimationTimer !== null) {
        globalThis.clearTimeout(winningAnimationTimer);
        winningAnimationTimer = null;
      }
      winningAnimationElement.removeEventListener("animationend", finish);
      winningAnimationCleanup = null;
      resolve();
    };

    winningAnimationCleanup = () => {
      winningAnimationElement.removeEventListener("animationend", finish);
      finished = true;
    };
    winningAnimationElement.addEventListener("animationend", finish);
    winningAnimationElement.classList.remove("winning-line--active");
    void winningAnimationElement.offsetWidth;
    winningAnimationElement.classList.add("winning-line--active");
    winningAnimationTimer = globalThis.setTimeout(finish, WINNING_LINE_DURATION);
  });
}

function showResult() {
  if ((!game.winner && !game.draw) || !resultDialog || resultDialog.open) return;

  player = updatePlayerAfterResult(player, game);
  resultMessage.textContent = game.winner ? `${game.winner} Won` : "Draw";
  if (resultDetail) {
    resultDetail.textContent = game.winner
      ? "Three in a row!"
      : "No spaces left on the board.";
  }
  openResultDialog();
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
  cancelWinningLine();
  gameRoot?.classList.remove("game--celebrating");
  board?.classList.remove("board--winner", "board--draw");
  status.classList.remove("status--winner", "status--draw", "status--updated");
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
  resetFeedback();
  game = createGame();
  player = startPlayerGame(player);
  gameStarted = true;
  homeScreen.hidden = true;
  gameScreen.hidden = false;
  render();
  cells[0]?.focus();
}

function showHome() {
  stopMatchmaking();
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

    player = updatePlayerAfterMove(player, game, index);
    render();
    replayAnimation(cell, "cell--placed");
    replayAnimation(status, "status--updated");

    if (game.winner) {
      animateWinningLine(getWinningLine(game.board)).then(showResult);
    } else if (game.draw) {
      showResult();
    }
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
