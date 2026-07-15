import { createGame, makeMove } from "./game.js";

const homeScreen = document.querySelector("#home-screen");
const gameScreen = document.querySelector("#game-screen");
const start = document.querySelector("#start-game");
const cells = [...document.querySelectorAll("[data-cell]")];
const status = document.querySelector("#status");
const reset = document.querySelector("#reset");
let game = createGame();
let gameStarted = false;

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
}

function showGame() {
  game = createGame();
  gameStarted = true;
  homeScreen.hidden = true;
  gameScreen.hidden = false;
  render();
  cells[0].focus();
}

cells.forEach((cell, index) => {
  cell.addEventListener("click", () => {
    game = makeMove(game, index);
    render();
  });
});

start.addEventListener("click", showGame);

reset.addEventListener("click", () => {
  game = createGame();
  render();
});

render();
