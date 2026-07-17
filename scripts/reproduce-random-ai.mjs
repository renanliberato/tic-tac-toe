import assert from "node:assert/strict";
import { GameController } from "../public/js/controller.js";
import { GameModel } from "../public/js/model.js";

class Timer {
  constructor() { this.jobs = new Map(); this.next = 1; }
  setTimeout(callback, delay) { const id = this.next++; this.jobs.set(id, { callback, delay }); return id; }
  clearTimeout(id) { this.jobs.delete(id); }
  run() { const jobs = [...this.jobs.values()]; this.jobs.clear(); jobs.forEach(({ callback }) => callback()); }
}
class View {
  constructor() { this.cells = Array(9).fill(null); }
  onStart(handler) { this.start = handler; }
  onCell(index, handler) { this.click ??= []; this.click[index] = handler; }
  onContinue() {}
  bindDialogGuards() {}
  render(state, started, line, player, opponent, score, aiPending) {
    this.last = { state, started, opponent, aiPending, score, player };
  }
  closeResultDialog() {} resetFeedback() {} showGame() {} focusFirstCell() {}
  replayMove() {} animateWinningLine() { return new Promise(() => {}); }
  openResultDialog() {} showHome() {} enterHome() {} finishCoinPresentation() {}
}

const timer = new Timer();
const view = new View();
const model = new GameModel();
const randomValues = [0, 0.999999];
const controller = new GameController(model, view, timer, () => randomValues.shift());
view.start();
assert.equal(view.last.started, true, "start must be immediate");
assert.equal(view.last.opponent.opponent_name, "Computer");
view.click[4]();
view.click[5]();
assert.deepEqual(model.getState().board, [null, null, null, null, "X", null, null, null, null], "rapid click must be ignored");
assert.equal(view.last.aiPending, true);
assert.equal([...timer.jobs.values()][0].delay, 500);
timer.run();
assert.equal(model.getState().board[0], "O", "random 0 must select first free cell");
assert.equal(controller.player.moves_played, 1, "AI moves must not count as local moves");
view.click[1]();
timer.run();
assert.equal(model.getState().board[8], "O", "random near 1 must select last free cell");
const board = [...model.getState().board];
view.click[2]();
controller.showHome();
timer.run();
assert.deepEqual(model.getState().board, Array(9).fill(null), "stale AI timeout must not mutate reset board");
assert.notDeepEqual(board, Array(9).fill(null));
console.log("random AI reproduction passed");
