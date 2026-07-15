export const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

export function createGame() {
  return { board: Array(9).fill(null), player: "X", winner: null, draw: false };
}

export function makeMove(game, index) {
  if (game.winner || game.draw || game.board[index] !== null) return game;

  const board = [...game.board];
  board[index] = game.player;
  const winner = getWinner(board);

  return {
    board,
    player: winner ? game.player : game.player === "X" ? "O" : "X",
    winner,
    draw: !winner && board.every(Boolean)
  };
}

export function getWinner(board) {
  const line = WINNING_LINES.find(([a, b, c]) => (
    board[a] && board[a] === board[b] && board[a] === board[c]
  ));
  return line ? board[line[0]] : null;
}
