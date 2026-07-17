import { afterEach, describe, expect, it } from "vitest";
import { GameController } from "../public/js/controller.js";
import { GameModel } from "../public/js/model.js";
import { LEADERBOARD_EPOCH } from "../public/js/leaderboard.js";

class View {
  constructor() { this.cells = Array(9); }
  onStart() {} onCell() {} onContinue() {} bindDialogGuards() {} render() {}
  resetFeedback() {} closeResultDialog() {} closeMatchmakingDialog() {}
  showGame() {} focusFirstCell() {} animateWinningLine() { return Promise.resolve(); }
  openResultDialog() {}
}

afterEach(() => { delete globalThis.localStorage; });

describe("decisive match leaderboard points", () => {
  it("awards once for the decisive third X win and duplicate protection applies", () => {
    const controller = new GameController(new GameModel(), new View(), {
      now: () => LEADERBOARD_EPOCH + 1, setTimeout: () => 1, clearTimeout() {}
    });
    expect(controller.player.leaderboard_cycle).toBe(0);
    controller.matchScore.X = 2;
    controller.recordResult({ winner: "X", draw: false });
    expect(controller.player.leaderboard_score).toBe(1);
    controller.recordResult({ winner: "X", draw: false });
    expect(controller.player.leaderboard_score).toBe(1);
  });

  it("does not award intermediate X, draw, O, or pre-launch results", () => {
    for (const [timestamp, score, state] of [
      [LEADERBOARD_EPOCH + 1, 1, { winner: "X", draw: false }],
      [LEADERBOARD_EPOCH + 1, 2, { winner: "O", draw: false }],
      [LEADERBOARD_EPOCH + 1, 2, { winner: null, draw: true }],
      [LEADERBOARD_EPOCH - 1, 2, { winner: "X", draw: false }]
    ]) {
      const controller = new GameController(new GameModel(), new View(), {
        now: () => timestamp, setTimeout: () => 1, clearTimeout() {}
      });
      const initialScore = controller.player.leaderboard_score;
      controller.matchScore.X = score;
      controller.recordResult(state);
      expect(controller.player.leaderboard_score).toBe(initialScore);
    }
  });
});
