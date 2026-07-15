import { describe, expect, it } from "vitest";
import { createGame, getWinner, makeMove } from "../public/js/game.js";

describe("tic-tac-toe", () => {
  it("starts with an empty board and X", () => {
    expect(createGame()).toEqual({
      board: Array(9).fill(null), player: "X", winner: null, draw: false
    });
  });

  it("alternates players and detects a winner", () => {
    let game = createGame();
    game = makeMove(game, 0);
    game = makeMove(game, 3);
    game = makeMove(game, 1);
    game = makeMove(game, 4);
    game = makeMove(game, 2);

    expect(game.winner).toBe("X");
    expect(getWinner(game.board)).toBe("X");
  });

  it("does not overwrite an occupied cell", () => {
    const game = makeMove(createGame(), 0);
    expect(makeMove(game, 0)).toEqual(game);
  });
});
