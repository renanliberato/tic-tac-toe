import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { GameController } from "../public/js/controller.js";
import { GameModel } from "../public/js/model.js";
import { GameView } from "../public/js/view.js";

class FakeView {
  constructor() {
    this.cells = Array(9).fill(null);
    this.rendered = [];
    this.startHandler = null;
    this.continueHandler = null;
    this.cellHandlers = [];
    this.actions = [];
    this.winningLines = [];
    this.resultStates = [];
    this.events = [];
    this.gameVisible = false;
  }

  onStart(handler) {
    this.startHandler = handler;
  }

  onCell(index, handler) {
    this.cellHandlers[index] = handler;
  }

  onContinue(handler) {
    this.continueHandler = handler;
  }

  bindDialogGuards() {}

  render(state, gameStarted, winningLine, player, opponent, matchScore) {
    this.events.push("render");
    this.rendered.push({ state, gameStarted, winningLine, player, opponent, matchScore, gameVisible: this.gameVisible });
  }

  showMatchmaking() { this.gameVisible = false; this.actions.push("showMatchmaking"); }
  showGame() { this.gameVisible = true; this.actions.push("showGame"); this.events.push("showGame"); }
  focusFirstCell() { this.events.push("focusFirstCell"); }
  showHome() { this.gameVisible = false; this.actions.push("showHome"); }
  closeResultDialog() { this.actions.push("closeResultDialog"); }
  openMatchmakingDialog() { this.actions.push("openMatchmakingDialog"); }
  closeMatchmakingDialog() { this.actions.push("closeMatchmakingDialog"); }
  resetFeedback() { this.actions.push("resetFeedback"); }
  replayMove(index) { this.actions.push(["replayMove", index]); }
  animateWinningLine(line) {
    this.winningLines.push(line);
    return Promise.resolve();
  }
  openResultDialog(state) { this.resultStates.push(state); }
}

function createViewDocument() {
  const cells = Array.from({ length: 9 }, (_, index) =>
    `<button data-cell="${index}" type="button"></button>`
  ).join("");

  return new JSDOM(`
    <main class="game">
      <section id="home-screen"><button id="start-game" type="button">Start game</button></section>
      <section id="game-screen" aria-labelledby="turn-announcement" hidden>
        <div class="players">
          <div class="player-card" data-player="local"><strong id="player-name"></strong><strong id="player-score"></strong></div>
          <div class="player-card" data-player="opponent" hidden><strong id="opponent-score"></strong><strong id="opponent-name"></strong></div>
        </div>
        <p id="turn-announcement" class="visually-hidden" role="status" aria-live="polite" aria-atomic="true"></p>
        <p id="status" class="status"></p>
        <div class="board">${cells}<span data-winning-line hidden></span></div>
      </section>
      <dialog id="matchmaking-dialog"></dialog>
      <dialog id="result-dialog">
        <h2 id="result-message"></h2>
        <p id="result-detail"></p>
        <button id="continue" type="button">Continue</button>
      </dialog>
    </main>
  `);
}

describe("MVC game architecture", () => {
  it("publishes state changes and supports unsubscribing from model updates", () => {
    const model = new GameModel();
    const states = [];
    const unsubscribe = model.subscribe((state) => states.push(state));

    expect(model.makeMove(0)).toBe(true);
    expect(model.makeMove(0)).toBe(false);
    expect(states).toHaveLength(1);
    expect(model.getState().board[0]).toBe("X");

    expect(model.reset().board).toEqual(Array(9).fill(null));
    expect(states).toHaveLength(2);

    unsubscribe();
    model.reset();
    expect(states).toHaveLength(2);
  });

  it("exposes the game screen before rendering the initial turn announcement", () => {
    const model = new GameModel();
    const view = new FakeView();
    let matchmakingCallback;
    const timer = {
      setTimeout(callback) {
        matchmakingCallback = callback;
        return 1;
      },
      clearTimeout() {}
    };

    new GameController(model, view, timer);
    view.startHandler();
    matchmakingCallback();

    const gameRenders = view.rendered.filter(({ gameStarted }) => gameStarted);
    expect(gameRenders).toHaveLength(1);
    expect(gameRenders[0].gameVisible).toBe(true);
    expect(view.events.slice(-3)).toEqual(["showGame", "render", "focusFirstCell"]);
  });

  it("scores a non-final win and automatically starts the next X round", async () => {
    const model = new GameModel();
    const view = new FakeView();
    const controller = new GameController(model, view, {
      setTimeout: () => 1,
      clearTimeout: () => {}
    });

    controller.startGame();
    for (const index of [0, 3, 1, 4, 2]) controller.play(index);

    expect(view.winningLines).toEqual([[0, 1, 2]]);
    expect(view.rendered.at(-1).matchScore).toEqual({ X: 1, O: 0 });
    expect(view.resultStates).toHaveLength(0);
    await Promise.resolve();
    expect(model.getState().board).toEqual(Array(9).fill(null));
    expect(model.getState().player).toBe("X");
    expect(view.events).toContain("focusFirstCell");
    expect(view.rendered.at(-1).matchScore).toEqual({ X: 1, O: 0 });
  });

  it("automatically starts a fresh round after a draw without changing score", () => {
    const model = new GameModel();
    const view = new FakeView();
    const controller = new GameController(model, view, {
      setTimeout: () => 1,
      clearTimeout: () => {}
    });

    controller.startGame();
    for (const index of [0, 1, 2, 4, 3, 5, 7, 6, 8]) controller.play(index);

    expect(view.resultStates).toHaveLength(0);
    expect(model.getState().board).toEqual(Array(9).fill(null));
    expect(model.getState().player).toBe("X");
    expect(view.rendered.at(-1).matchScore).toEqual({ X: 0, O: 0 });
  });

  it("shows the result only when a player reaches three points and keeps O scoring separate", async () => {
    const model = new GameModel();
    const view = new FakeView();
    const controller = new GameController(model, view, {
      setTimeout: () => 1,
      clearTimeout: () => {}
    });

    controller.startGame();
    for (let round = 0; round < 3; round += 1) {
      for (const index of [0, 1, 2, 4, 3, 7]) controller.play(index);
      await Promise.resolve();
    }

    expect(view.rendered.at(-1).matchScore).toEqual({ X: 0, O: 3 });
    expect(view.resultStates).toHaveLength(1);
    expect(view.resultStates[0].winner).toBe("O");
    expect(model.getState().board).not.toEqual(Array(9).fill(null));
  });

  it("ignores a completed-round animation callback after leaving the match", async () => {
    const model = new GameModel();
    const view = new FakeView();
    let resolveAnimation;
    view.animateWinningLine = (line) => {
      view.winningLines.push(line);
      return new Promise((resolve) => { resolveAnimation = resolve; });
    };
    const controller = new GameController(model, view, {
      setTimeout: () => 1,
      clearTimeout: () => {}
    });

    controller.startGame();
    for (const index of [0, 3, 1, 4, 2]) controller.play(index);
    controller.showHome();
    resolveAnimation();
    await Promise.resolve();

    expect(view.resultStates).toHaveLength(0);
    expect(model.getState().board).toEqual(Array(9).fill(null));
    expect(view.actions).not.toContain("focusFirstCell");
  });

  it("renders state and winning-line geometry in the DOM view", () => {
    const dom = createViewDocument();
    const documentRef = dom.window.document;
    const view = new GameView(documentRef);
    const board = documentRef.querySelector(".board");

    for (const [index, cell] of [...documentRef.querySelectorAll("[data-cell]")].entries()) {
      Object.defineProperties(cell, {
        offsetParent: { configurable: true, value: board },
        offsetLeft: { configurable: true, value: (index % 3) * 120 },
        offsetTop: { configurable: true, value: Math.floor(index / 3) * 120 },
        offsetWidth: { configurable: true, value: 100 },
        offsetHeight: { configurable: true, value: 100 }
      });
    }

    view.render({
      board: ["X", "X", "X", "O", null, null, null, null, null],
      player: "X",
      winner: "X",
      draw: false
    }, true, [0, 1, 2],
    { player_name: "PixelPilot" },
    { opponent_id: "123e4567-e89b-42d3-a456-426614174000", opponent_name: "Ace" });

    expect(documentRef.querySelector("#player-name").textContent).toBe("PixelPilot");
    expect(documentRef.querySelector("#opponent-name").textContent).toBe("Ace");
    expect(documentRef.querySelector("#player-score").textContent).toBe("0");
    expect(documentRef.querySelector("#opponent-score").textContent).toBe("0");
    expect(documentRef.querySelector("#player-score").getAttribute("aria-label")).toBe("Your score: 0");
    expect(documentRef.querySelector("#opponent-score").getAttribute("aria-label")).toBe("Opponent score: 0");
    expect(documentRef.querySelector("[data-player=\"opponent\"]").hidden).toBe(false);
    expect([...view.cells].map((cell) => cell.textContent)).toEqual([
      "X", "X", "X", "O", "", "", "", "", ""
    ]);

    const xIcon = view.cells[0].querySelector("svg");
    expect(xIcon.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(xIcon.classList.contains("mark-icon")).toBe(true);
    expect(xIcon.classList.contains("mark-icon--x")).toBe(true);
    expect(xIcon.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(xIcon.getAttribute("aria-hidden")).toBe("true");
    expect(xIcon.getAttribute("focusable")).toBe("false");
    expect(xIcon.querySelector("title").textContent).toBe("X");
    expect(xIcon.querySelector("path").getAttribute("d")).toBe("M24 24 76 76M76 24 24 76");
    expect(xIcon.querySelector("path").classList.contains("mark-icon__stroke")).toBe(true);

    const oIcon = view.cells[3].querySelector("svg");
    expect(oIcon.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(oIcon.classList.contains("mark-icon--o")).toBe(true);
    expect(oIcon.querySelector("title").textContent).toBe("O");
    expect(oIcon.querySelector("circle").getAttribute("cx")).toBe("50");
    expect(oIcon.querySelector("circle").getAttribute("cy")).toBe("50");
    expect(oIcon.querySelector("circle").getAttribute("r")).toBe("29");
    expect(oIcon.querySelector("circle").classList.contains("mark-icon__stroke")).toBe(true);
    expect(view.cells[4].querySelector("svg")).toBeNull();

    view.render({
      board: ["X", "X", "X", "O", null, null, null, null, null],
      player: "X",
      winner: "X",
      draw: false
    }, true, [0, 1, 2],
    { player_name: "PixelPilot" },
    { opponent_id: "123e4567-e89b-42d3-a456-426614174000", opponent_name: "Ace" }, { X: 2, O: 1 });
    expect(documentRef.querySelector("#player-score").textContent).toBe("2");
    expect(documentRef.querySelector("#opponent-score").textContent).toBe("1");
    expect(documentRef.querySelector("#player-score").getAttribute("aria-label")).toBe("Your score: 2");
    expect(documentRef.querySelector("#opponent-score").getAttribute("aria-label")).toBe("Opponent score: 1");
    expect(documentRef.querySelector("[data-player=\"local\"]").dataset.score).toBe("2");
    expect(documentRef.querySelector("[data-player=\"opponent\"]").dataset.score).toBe("1");

    expect(view.cells.slice(0, 3).every((cell) => cell.classList.contains("cell--winner"))).toBe(true);
    expect(view.cells[0].disabled).toBe(true);
    expect(view.cells[4].disabled).toBe(true);
    expect(view.cells[0].getAttribute("aria-label")).toBe("Cell 1, X");
    expect(documentRef.querySelector("#status").textContent).toBe("");
    const turnAnnouncement = documentRef.querySelector("#turn-announcement");
    expect(turnAnnouncement.textContent).toBe("Player X won!");

    const winningLine = documentRef.querySelector("[data-winning-line]");
    expect(winningLine.dataset.line).toBe("0,1,2");
    expect(winningLine.style.left).toBe("50px");
    expect(winningLine.style.width).toBe("240px");
    expect(winningLine.style.getPropertyValue("--winning-line-angle")).toBe("0rad");

    view.render({ board: ["X", "O", "X", "X", "O", "O", "O", "X", "X"], player: "O", winner: null, draw: true }, true, [],
      { player_name: "PixelPilot" }, { opponent_id: "opponent", opponent_name: "Ace" });
    expect(turnAnnouncement.textContent).toBe("It's a draw!");
  });

  it("focuses the first cell when requested by the controller", () => {
    const dom = createViewDocument();
    const view = new GameView(dom.window.document);

    view.focusFirstCell();

    expect(dom.window.document.activeElement).toBe(view.cells[0]);
  });

  it("uses player-card borders to indicate the active turn", () => {
    const dom = createViewDocument();
    const documentRef = dom.window.document;
    const view = new GameView(documentRef);
    const localCard = documentRef.querySelector("[data-player=\"local\"]");
    const opponentCard = documentRef.querySelector("[data-player=\"opponent\"]");

    const emptyBoard = Array(9).fill(null);
    view.render({ board: emptyBoard, player: "X", winner: null, draw: false }, true, [],
      { player_name: "PixelPilot" }, { opponent_id: "opponent", opponent_name: "Ace" });
    const turnAnnouncement = documentRef.querySelector("#turn-announcement");
    expect(documentRef.querySelector("#game-screen").getAttribute("aria-labelledby")).toBe("turn-announcement");
    expect(turnAnnouncement.getAttribute("role")).toBe("status");
    expect(turnAnnouncement.getAttribute("aria-live")).toBe("polite");
    expect(turnAnnouncement.textContent).toBe("Player X's turn");
    expect(localCard.classList.contains("player-card--active")).toBe(true);
    expect(localCard.getAttribute("aria-current")).toBe("true");
    expect(opponentCard.classList.contains("player-card--active")).toBe(false);

    view.render({ board: ["X", null, null, null, null, null, null, null, null], player: "O", winner: null, draw: false }, true, [],
      { player_name: "PixelPilot" }, { opponent_id: "opponent", opponent_name: "Ace" });
    expect(turnAnnouncement.textContent).toBe("Player O's turn");
    expect(localCard.classList.contains("player-card--active")).toBe(false);
    expect(localCard.hasAttribute("aria-current")).toBe(false);
    expect(opponentCard.classList.contains("player-card--active")).toBe(true);
    expect(opponentCard.getAttribute("aria-current")).toBe("true");

    view.render({ board: ["X", "X", "X", "O", null, null, null, null, null], player: "X", winner: "X", draw: false }, true, [0, 1, 2],
      { player_name: "PixelPilot" }, { opponent_id: "opponent", opponent_name: "Ace" });
    expect(localCard.classList.contains("player-card--active")).toBe(false);
    expect(opponentCard.classList.contains("player-card--active")).toBe(false);
  });

  it("prevents dialog dismissal and supplies result feedback", () => {
    const dom = createViewDocument();
    const documentRef = dom.window.document;
    const view = new GameView(documentRef);
    const resultDialog = documentRef.querySelector("#result-dialog");

    view.bindDialogGuards();
    const cancelEvent = new dom.window.Event("cancel", { cancelable: true });
    expect(resultDialog.dispatchEvent(cancelEvent)).toBe(false);
    expect(cancelEvent.defaultPrevented).toBe(true);

    view.openResultDialog({ winner: "O", draw: false });
    expect(resultDialog.open).toBe(true);
    expect(documentRef.querySelector("#result-message").textContent).toBe("O Won");
    expect(documentRef.querySelector("#result-detail").textContent).toBe("Three in a row!");
  });
});
