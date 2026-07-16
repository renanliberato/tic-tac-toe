import { createGame, makeMove } from "./game.js";

/**
 * Application model for a tic-tac-toe game.
 *
 * The model deliberately knows nothing about the DOM. Consumers can subscribe
 * to state changes and render the returned game state in any kind of view.
 */
export class GameModel {
  constructor() {
    this.state = createGame();
    this.listeners = new Set();
  }

  getState() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset() {
    this.state = createGame();
    this.notify();
    return this.state;
  }

  makeMove(index) {
    const nextState = makeMove(this.state, index);
    if (nextState === this.state) return false;

    this.state = nextState;
    this.notify();
    return true;
  }

  notify() {
    for (const listener of this.listeners) listener(this.state);
  }
}

export function createGameModel() {
  return new GameModel();
}
