import { createGame, makeMove } from "./game.js";

const cells = [...document.querySelectorAll("[data-cell]")];
const status = document.querySelector("#status");
const reset = document.querySelector("#reset");
let game = createGame();

function render() {
  cells.forEach((cell, index) => {
    cell.textContent = game.board[index] || "";
    cell.disabled = Boolean(game.board[index]) || Boolean(game.winner) || game.draw;
  });

  status.textContent = game.winner
    ? `Player ${game.winner} wins!`
    : game.draw
      ? "It's a draw!"
      : `Player ${game.player}'s turn`;
}

cells.forEach((cell, index) => {
  cell.addEventListener("click", () => {
    game = makeMove(game, index);
    render();
  });
});

reset.addEventListener("click", () => {
  game = createGame();
  render();
});

render();
