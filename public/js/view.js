import { applyPageScale } from "./layout.js";
import { createStandings, getCycle } from "./leaderboard.js";
import { PLAYER_STORAGE_KEY } from "./player.js";
import { BATTLE_PASS_MILESTONES, getBattlePassCycle } from "./battle-pass.js";
import { BOARD_STYLES, getBoardStyle, styleTokens } from "./board-styles.js";

const WINNING_LINE_DURATION = 700;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const COIN_TRAVEL_DURATION = 1100;
const COIN_TOTAL_DURATION = 1400;
const COIN_SIZE = 58;
const MAX_FLYING_COINS = 20;
const DAILY_GIFT_CHECK_DURATION = 360;
const DAILY_GIFT_REWARDS = [10, 10, 10, 10, 10, 10, 100];

export function formatCoinBalance(balance) {
  const value = Number.isInteger(balance) && balance >= 0 ? balance : 0;
  return String(Math.min(value, 9999)).padStart(4, "0");
}

const WINNING_LINE_CLASSES = {
  "0,1,2": "winning-line--row-0",
  "3,4,5": "winning-line--row-1",
  "6,7,8": "winning-line--row-2",
  "0,3,6": "winning-line--column-0",
  "1,4,7": "winning-line--column-1",
  "2,5,8": "winning-line--column-2",
  "0,4,8": "winning-line--diagonal-main",
  "2,4,6": "winning-line--diagonal-reverse"
};

/**
 * DOM view for the game. It translates state and controller commands into
 * markup, classes, focus changes, and visual feedback.
 */
export class GameView {
  constructor(documentRef = globalThis.document, clock = () => Date.now()) {
    this.document = documentRef;
    this.now = clock;
    this.gameRoot = documentRef.querySelector(".game");
    this.homeScreen = documentRef.querySelector("#home-screen");
    this.homeTitle = documentRef.querySelector("#home-title");
    this.gameScreen = documentRef.querySelector("#game-screen");
    this.leaderboardScreen = documentRef.querySelector("#leaderboard-screen");
    this.leaderboardEntry = documentRef.querySelector("#open-leaderboard");
    this.leaderboardBack = documentRef.querySelector("#leaderboard-back");
    this.leaderboardList = documentRef.querySelector("#leaderboard-list");
    this.leaderboardMessage = documentRef.querySelector("#leaderboard-message");
    this.floatingLocalRow = documentRef.querySelector("#floating-local-row");
    this.battlePassScreen = documentRef.querySelector("#battle-pass-screen");
    this.battlePassEntry = documentRef.querySelector("#open-battle-pass");
    this.battlePassBack = documentRef.querySelector("#battle-pass-back");
    this.battlePassHeading = documentRef.querySelector("#battle-pass-title");
    this.battlePassProgress = documentRef.querySelector("[data-battle-pass-progress]");
    this.battlePassReset = documentRef.querySelector("[data-battle-pass-reset]");
    this.battlePassTargetText = documentRef.querySelector("[data-battle-pass-target-text]");
    this.battlePassKeepPlaying = documentRef.querySelector("[data-battle-pass-keep-playing]");
    this.battlePassComplete = documentRef.querySelector("[data-battle-pass-complete]");
    this.battlePassPercent = documentRef.querySelector("[data-battle-pass-percent]");
    this.battlePassProgressBar = documentRef.querySelector("[data-battle-pass-progress-bar]");
    this.battlePassProgressFill = documentRef.querySelector("[data-battle-pass-progress-fill]");
    this.battlePassList = documentRef.querySelector("#battle-pass-list");
    this.battlePassAnnouncement = documentRef.querySelector("#battle-pass-announcement");
    this.battlePassVfxTimer = null;
    this.battlePassHasRendered = false;
    this.profileScreen = documentRef.querySelector("#profile-screen");
    this.stylesScreen = documentRef.querySelector("#styles-screen");
    this.profileButton = documentRef.querySelector("#open-profile");
    this.profileBack = documentRef.querySelector("#profile-back");
    this.profileHeading = documentRef.querySelector("#profile-title");
    this.profileName = documentRef.querySelector("#profile-name");
    this.stylesButton = documentRef.querySelector("#open-styles");
    this.stylesBack = documentRef.querySelector("#styles-back");
    this.stylesHeading = documentRef.querySelector("#styles-title");
    this.stylesGrid = documentRef.querySelector("#styles-grid");
    this.stylesBalance = documentRef.querySelector("#styles-balance");
    this.stylesBalanceAmount = documentRef.querySelector("[data-styles-balance]");
    this.styleAnnouncement = documentRef.querySelector("#style-announcement");
    this.insufficientDialog = documentRef.querySelector("#insufficient-dialog");
    this.insufficientMessage = documentRef.querySelector("#insufficient-message");
    this.insufficientOk = documentRef.querySelector("#insufficient-ok");
    this.insufficientOpener = null;
    this.start = documentRef.querySelector("#start-game");
    this.winStreak = documentRef.querySelector("[data-win-streak]");
    this.winStreakStatus = documentRef.querySelector("[data-win-streak-status]");
    this.streakFlames = [...documentRef.querySelectorAll("[data-streak-flame]")];
    this.coinHolder = documentRef.querySelector("#coin-holder");
    this.coinAmount = documentRef.querySelector("#coin-amount");
    this.coinAnnouncement = documentRef.querySelector("#coin-announcement");
    this.coinPresentation = null;
    this.coinPresentationId = 0;
    this.dailyGiftLauncher = documentRef.querySelector("#daily-gifts-launcher");
    this.dailyGiftDialog = documentRef.querySelector("#daily-gifts-dialog");
    this.dailyGiftGrid = documentRef.querySelector("#daily-gifts-grid");
    this.dailyGiftDescription = documentRef.querySelector("#daily-gifts-description");
    this.dailyGiftAction = documentRef.querySelector("#daily-gifts-action");
    this.dailyGiftClaiming = false;
    this.dailyGiftMode = "readonly";
    this.dailyGiftOpener = null;
    this.dailyGiftHandlers = null;
    this.cells = [...documentRef.querySelectorAll("[data-cell]")];
    this.board = documentRef.querySelector(".board");
    this.status = documentRef.querySelector("#status");
    this.turnAnnouncement = documentRef.querySelector("#turn-announcement");
    this.playerPanel = documentRef.querySelector("[data-player=\"local\"]");
    this.playerName = documentRef.querySelector("#player-name");
    this.opponentName = documentRef.querySelector("#opponent-name");
    this.opponentPanel = documentRef.querySelector("[data-player=\"opponent\"]");
    this.playerScore = documentRef.querySelector("#player-score");
    this.opponentScore = documentRef.querySelector("#opponent-score");
    this.matchmakingDialog = documentRef.querySelector("#matchmaking-dialog");
    this.resultDialog = documentRef.querySelector("#result-dialog");
    this.resultMessage = documentRef.querySelector("#result-message");
    this.resultDetail = documentRef.querySelector("#result-detail");
    this.continueButton = documentRef.querySelector("#continue");
    this.winningLineElement = this.board?.querySelector("[data-winning-line]");
    this.winningAnimationId = 0;
    this.winningAnimationTimer = null;
    this.winningAnimationCleanup = null;
    this.leaderboardRefreshHandler = null;
    this.leaderboardInterval = null;
    this.leaderboardObserver = null;
    this.leaderboardOpen = false;
    this.currentLeaderboardPlayer = null;
    this.handleLeaderboardScroll = () => this.updateFloatingLocalRow();
    this.handleVisibilityChange = () => {
      if (this.document.visibilityState === "visible") this.refreshLeaderboard();
    };
    this.handleStorageChange = (event) => {
      if (event.key === PLAYER_STORAGE_KEY) this.refreshLeaderboard(true);
    };
    this.handleFloatingActivation = () => this.jumpToLocalRow();


    if (!this.winningLineElement && this.board) {
      this.winningLineElement = documentRef.createElement("span");
      this.winningLineElement.className = "winning-line";
      this.winningLineElement.dataset.winningLine = "";
      this.winningLineElement.setAttribute("aria-hidden", "true");
      this.board.append(this.winningLineElement);
    }

    this.bindInsufficientDialog();
    this.bindDailyGiftDialog();
    applyPageScale(this.gameRoot, documentRef.defaultView);
  }

  onStart(handler) {
    this.start?.addEventListener("click", handler);
  }

  onCell(index, handler) {
    this.cells[index]?.addEventListener("click", handler);
  }

  onContinue(handler) {
    this.continueButton?.addEventListener("click", handler);
  }

  onDailyGiftOpen(handler) {
    this.dailyGiftLauncher?.addEventListener("click", handler);
  }

  onProfile(handler) { this.profileButton?.addEventListener("click", handler); }
  onProfileBack(handler) { this.profileBack?.addEventListener("click", handler); }
  onStyles(handler) { this.stylesButton?.addEventListener("click", handler); }
  onStylesBack(handler) { this.stylesBack?.addEventListener("click", handler); }
  onStyle(handler) {
    this.stylesGrid?.addEventListener("click", (event) => {
      const tile = event.target.closest("[data-style-id]");
      if (tile) handler(tile.dataset.styleId, tile);
    });
  }

  onLeaderboardOpen(handler) {
    this.leaderboardEntry?.addEventListener("click", handler);
  }

  onLeaderboardBack(handler) {
    this.leaderboardBack?.addEventListener("click", handler);
  }

  onBattlePassOpen(handler) {
    this.battlePassEntry?.addEventListener("click", handler);
  }

  onBattlePassBack(handler) {
    this.battlePassBack?.addEventListener("click", handler);
  }

  onBattlePassClaim(handler) {
    this.battlePassList?.addEventListener("click", (event) => {
      const milestone = event.target.closest("[data-battle-pass-milestone]");
      if (milestone && !milestone.disabled) handler(Number(milestone.dataset.battlePassMilestone));
    });
  }

  onLeaderboardRefresh(handler) {
    this.leaderboardRefreshHandler = handler;
  }

  bindDailyGiftDialog() {
    if (!this.dailyGiftDialog) return;
    this.dailyGiftDialog.addEventListener("click", (event) => {
      if (this.isDialogBackdropClick(event, this.dailyGiftDialog)) {
        event.stopPropagation();
        this.dismissDailyGift();
        return;
      }
      if (this.dailyGiftClaiming) return;
      if (this.dailyGiftMode === "claimable") {
        this.dailyGiftClaiming = true;
        this.dailyGiftAction && (this.dailyGiftAction.disabled = true);
        this.dailyGiftHandlers?.claim?.();
      } else {
        this.dismissDailyGift();
      }
    });
    this.dailyGiftDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.dismissDailyGift();
    });
  }

  isDialogBackdropClick(event, dialog) {
    if (event.target !== dialog) return false;
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom;
  }

  renderDailyGift(gift) {
    if (!this.dailyGiftGrid || !gift) return;
    const cells = DAILY_GIFT_REWARDS.map((amount, index) => {
      const day = index + 1;
      const cell = this.document.createElement("div");
      cell.className = "daily-gift-cell";
      cell.dataset.day = String(day);
      const claimed = day < gift.day || (day === gift.day && gift.claimed);
      const current = day === gift.day && !gift.claimed;
      cell.classList.toggle("daily-gift-cell--claimed", claimed);
      cell.classList.toggle("daily-gift-cell--current", current);
      cell.setAttribute("aria-label", `Day ${day}, ${amount} coins${claimed ? ", claimed" : current ? ", available" : ""}`);
      cell.innerHTML = `<strong>Day ${day}</strong><span class="daily-gift-value"><span aria-hidden="true">¢</span> ${amount}</span><span class="daily-gift-check" aria-hidden="true">✓</span>`;
      return cell;
    });
    this.dailyGiftGrid.replaceChildren(...cells);
  }

  openDailyGift(gift, handlers = {}, opener = null) {
    if (!this.dailyGiftDialog || !gift || this.dailyGiftDialog.open) return false;
    this.dailyGiftHandlers = handlers;
    this.dailyGiftOpener = opener || this.document.activeElement || this.dailyGiftLauncher;
    this.dailyGiftMode = gift.claimed ? "readonly" : "claimable";
    this.dailyGiftClaiming = false;
    this.renderDailyGift(gift);
    if (this.dailyGiftDescription) this.dailyGiftDescription.textContent = gift.claimed
      ? "Come back tomorrow for your next gift."
      : "Tap anywhere to claim today's reward";
    if (this.dailyGiftAction) {
      this.dailyGiftAction.textContent = gift.claimed ? "Close" : "Claim";
      this.dailyGiftAction.disabled = false;
    }
    this.dailyGiftDialog.dataset.mode = this.dailyGiftMode;
    this.openDialog(this.dailyGiftDialog, this.dailyGiftAction);
    return true;
  }

  dismissDailyGift() {
    if (!this.dailyGiftDialog?.open && !this.dailyGiftDialog?.hasAttribute("open")) return;
    const callback = this.dailyGiftHandlers?.dismiss;
    this.closeDailyGift();
    callback?.();
  }

  closeDailyGift({ restoreFocus = true } = {}) {
    if (!this.dailyGiftDialog) return;
    this.closeDialog(this.dailyGiftDialog);
    this.dailyGiftHandlers = null;
    this.dailyGiftClaiming = false;
    if (restoreFocus && this.dailyGiftOpener?.isConnected) this.dailyGiftOpener.focus();
  }

  animateDailyGiftClaim(gift) {
    this.renderDailyGift(gift);
    const cell = this.dailyGiftGrid?.querySelector(`[data-day="${gift.day}"]`);
    cell?.classList.add("daily-gift-cell--checking");
    if (this.isReducedMotion()) return Promise.resolve();
    return new Promise((resolve) => globalThis.setTimeout(resolve, DAILY_GIFT_CHECK_DURATION));
  }


  preventDialogDismissal(dialog) {
    dialog?.addEventListener("cancel", (event) => {
      event.preventDefault();
    });
  }

  bindDialogGuards() {
    this.preventDialogDismissal(this.matchmakingDialog);
    this.preventDialogDismissal(this.resultDialog);
  }

  render(state, gameStarted, winningLine = [], player = null, opponent = null, matchScore = null, aiPending = false) {
    if (!this.coinPresentation) this.renderCoinBalance(player?.coin_balance ?? 0);
    this.applyBoardStyle(player?.equipped_style);
    this.renderWinStreak(player?.win_streak);
    this.renderPlayers(player, opponent, state, gameStarted, matchScore);
    this.cells.forEach((cell, index) => {
      const mark = state.board[index] || "";
      cell.replaceChildren(mark ? this.createMarkIcon(mark) : "");
      cell.dataset.mark = mark;
      cell.classList.toggle("cell--placed", Boolean(mark));
      cell.classList.toggle("cell--winner", winningLine.includes(index));
      cell.setAttribute("aria-label", mark
        ? `Cell ${index + 1}, ${mark}`
        : `Cell ${index + 1}`);
      cell.disabled = !gameStarted || state.player !== "X" || aiPending
        || Boolean(mark) || Boolean(state.winner) || state.draw;
    });

    const feedback = state.draw ? "It\'s a draw!" : "";
    this.status.textContent = feedback;
    if (this.turnAnnouncement) {
      this.turnAnnouncement.textContent = feedback || (state.winner
        ? (state.winner === "X" ? "You won!" : "Computer won!")
        : (gameStarted ? (state.player === "X" && !aiPending
          ? "Your turn"
          : "Computer is thinking…") : ""));
    }
    this.status.classList.toggle("status--winner", Boolean(state.winner));
    this.status.classList.toggle("status--draw", state.draw);
    this.board?.classList.toggle("board--winner", Boolean(state.winner));
    this.board?.classList.toggle("board--draw", state.draw);
    this.gameRoot?.classList.toggle("game--celebrating", Boolean(state.winner || state.draw));

    if (this.winningLineElement) {
      this.winningLineElement.hidden = !state.winner;
      if (state.winner) this.setWinningLine(this.winningLineElement, winningLine);
    }
  }

  renderWinStreak(streak) {
    const value = Number.isInteger(streak) && streak >= 0 ? Math.min(streak, 3) : 0;
    if (this.winStreakStatus) this.winStreakStatus.textContent = `Win streak: ${value} of 3`;
    if (this.winStreak) this.winStreak.dataset.streak = String(value);
    this.streakFlames.forEach((flame, index) => {
      flame.classList.toggle("streak-flame--filled", index < value);
    });
  }

  renderCoinBalance(balance) {
    const value = Number.isInteger(balance) && balance >= 0 ? balance : 0;
    if (this.coinAmount) this.coinAmount.textContent = formatCoinBalance(value);
    if (this.coinHolder) this.coinHolder.setAttribute("aria-label", `Coin balance: ${value}`);
  }

  isReducedMotion() {
    try {
      return Boolean(this.document.defaultView?.matchMedia?.(
        "(prefers-reduced-motion: reduce)"
      ).matches);
    } catch {
      return false;
    }
  }

  ensureHomeTitle() {
    if (!this.homeScreen) return;

    if (!this.homeTitle || !this.homeScreen.contains(this.homeTitle)) {
      this.homeTitle = this.document.createElement("h2");
      this.homeTitle.id = "home-title";
      this.homeTitle.textContent = "TIC TAC TOE";
      const preview = this.homeScreen.querySelector(".home-preview");
      this.homeScreen.insertBefore(this.homeTitle, preview || this.start || null);
    }

    this.homeTitle.hidden = false;
  }

  enterHome(player, onConsumed) {
    this.ensureHomeTitle();
    this.finishCoinPresentation();

    const balance = Number.isInteger(player?.coin_balance) && player.coin_balance >= 0
      ? player.coin_balance
      : 0;
    const pending = Number.isInteger(player?.pending_coins) && player.pending_coins >= 0
      ? player.pending_coins
      : 0;
    if (!this.coinHolder || !pending) {
      this.renderCoinBalance(balance);
      return;
    }

    const initialBalance = Math.max(0, balance - pending);
    const session = {
      id: ++this.coinPresentationId,
      balance,
      pending,
      presented: initialBalance,
      finalized: false,
      timers: [],
      elements: [],
      onConsumed
    };
    this.coinPresentation = session;
    this.renderCoinBalance(initialBalance);

    if (this.isReducedMotion()) {
      this.finishCoinPresentation();
      return;
    }

    const iconCount = Math.min(pending, MAX_FLYING_COINS);
    const stagger = iconCount > 1
      ? Math.min(150, (COIN_TOTAL_DURATION - COIN_TRAVEL_DURATION) / (iconCount - 1))
      : 0;
    const homeRect = this.homeScreen?.getBoundingClientRect?.() || { left: 0, top: 0 };
    const source = this.getCoinPoint(this.homeScreen?.querySelector(".home-preview"), homeRect, .5, .62);
    const target = this.getCoinPoint(this.coinHolder, homeRect, .5, .5);
    const lastArrival = iconCount - 1;

    for (let index = 0; index < iconCount; index += 1) {
      const coin = this.document.createElement("span");
      const travel = this.document.createElement("span");
      const face = this.document.createElement("span");
      coin.className = "flying-coin";
      travel.className = "flying-coin__travel";
      face.className = "flying-coin__face";
      coin.dataset.coinIndex = String(index);
      coin.dataset.flyingCoin = "";
      coin.setAttribute("aria-hidden", "true");
      coin.setAttribute("role", "presentation");
      travel.setAttribute("aria-hidden", "true");
      face.setAttribute("aria-hidden", "true");
      // Points represent centers; absolute positioning starts at the element
      // corner, so offset by half the rendered coin size for a centered flight.
      coin.style.left = `${source.x - COIN_SIZE / 2}px`;
      coin.style.top = `${source.y - COIN_SIZE / 2}px`;
      coin.style.setProperty("--coin-dx", `${target.x - source.x}px`);
      coin.style.setProperty("--coin-dy", `${target.y - source.y}px`);
      coin.style.setProperty("--coin-delay", `${index * stagger}ms`);
      coin.style.setProperty("--coin-duration", `${COIN_TRAVEL_DURATION}ms`);
      face.append(this.createCoinIcon());
      travel.append(face);
      coin.append(travel);
      this.homeScreen?.append(coin);
      session.elements.push(coin);

      const increment = pending > MAX_FLYING_COINS && index === lastArrival
        ? pending - (MAX_FLYING_COINS - 1)
        : 1;
      const timer = globalThis.setTimeout(() => {
        if (!this.isCurrentCoinPresentation(session)) return;
        session.presented = Math.min(balance, session.presented + increment);
        this.renderCoinBalance(session.presented);
        if (index === lastArrival) this.finishCoinPresentation(session);
      }, COIN_TRAVEL_DURATION + index * stagger);
      session.timers.push(timer);
    }
  }

  getCoinPoint(element, containerRect, fallbackX, fallbackY) {
    const rect = element?.getBoundingClientRect?.();
    if (!rect || !rect.width && !rect.height) {
      return {
        x: containerRect.width ? containerRect.width * fallbackX : 0,
        y: containerRect.height ? containerRect.height * fallbackY : 0
      };
    }
    const layoutWidth = this.homeScreen?.offsetWidth || containerRect.width || 1;
    const layoutHeight = this.homeScreen?.offsetHeight || containerRect.height || 1;
    const scaleX = containerRect.width ? containerRect.width / layoutWidth : 1;
    const scaleY = containerRect.height ? containerRect.height / layoutHeight : 1;
    return {
      x: (rect.left - containerRect.left + rect.width / 2) / scaleX,
      y: (rect.top - containerRect.top + rect.height / 2) / scaleY
    };
  }

  createCoinIcon() {
    const icon = this.document.createElement("span");
    icon.className = "coin-art";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "¢";
    return icon;
  }

  isCurrentCoinPresentation(session) {
    return this.coinPresentation === session
      && session.id === this.coinPresentationId
      && !session.finalized;
  }

  finishCoinPresentation(session = this.coinPresentation) {
    if (!session || !this.isCurrentCoinPresentation(session)) return;
    session.finalized = true;
    session.timers.forEach((timer) => globalThis.clearTimeout(timer));
    session.elements.forEach((element) => element.remove());
    session.elements = [];
    session.timers = [];
    this.renderCoinBalance(session.balance);
    this.coinPresentation = null;
    session.onConsumed?.();
    if (this.coinAnnouncement) {
      this.coinAnnouncement.textContent = `${session.pending} coins earned; balance ${session.balance}`;
    }
  }

  createMarkIcon(mark) {
    const icon = this.document.createElementNS(SVG_NAMESPACE, "svg");
    icon.classList.add("mark-icon", `mark-icon--${mark.toLowerCase()}`);
    icon.setAttribute("viewBox", "0 0 100 100");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");

    const title = this.document.createElementNS(SVG_NAMESPACE, "title");
    title.textContent = mark;
    icon.append(title);

    if (mark === "X") {
      const strokes = this.document.createElementNS(SVG_NAMESPACE, "path");
      strokes.classList.add("mark-icon__stroke");
      strokes.setAttribute("d", "M24 24 76 76M76 24 24 76");
      icon.append(strokes);
    } else if (mark === "O") {
      const ring = this.document.createElementNS(SVG_NAMESPACE, "circle");
      ring.classList.add("mark-icon__stroke");
      ring.setAttribute("cx", "50");
      ring.setAttribute("cy", "50");
      ring.setAttribute("r", "29");
      icon.append(ring);
    }

    return icon;
  }

  renderPlayers(player, opponent, state, gameStarted, matchScore = null) {
    const localScore = String(matchScore?.X ?? 0);
    const opponentScore = String(matchScore?.O ?? 0);
    if (this.playerScore) {
      this.playerScore.textContent = localScore;
      this.playerScore.setAttribute("aria-label", `Your score: ${localScore}`);
    }
    if (this.opponentScore) {
      this.opponentScore.textContent = opponentScore;
      this.opponentScore.setAttribute("aria-label", `Computer score: ${opponentScore}`);
    }
    if (this.playerPanel) this.playerPanel.dataset.score = localScore;
    if (this.opponentPanel) this.opponentPanel.dataset.score = opponentScore;
    if (this.playerName) this.playerName.textContent = player?.player_name || "You";
    if (this.opponentName) this.opponentName.textContent = opponent?.opponent_name || "";

    if (this.opponentPanel) {
      this.opponentPanel.hidden = !opponent;
      this.opponentPanel.dataset.playerId = opponent?.opponent_id || "";
      this.opponentPanel.dataset.opponentId = opponent?.opponent_id || "";
    }

    const turnIsActive = gameStarted && !state?.winner && !state?.draw;
    this.setTurnIndicator(this.playerPanel, turnIsActive && state?.player === this.getPanelMark(this.playerPanel, "X"));
    this.setTurnIndicator(this.opponentPanel, turnIsActive && Boolean(opponent)
      && state?.player === this.getPanelMark(this.opponentPanel, "O"));
  }

  getPanelMark(panel, fallback) {
    return panel?.dataset.mark || fallback;
  }

  setTurnIndicator(panel, isActive) {
    if (!panel) return;

    panel.classList.toggle("player-card--active", isActive);
    if (isActive) {
      panel.setAttribute("aria-current", "true");
    } else {
      panel.removeAttribute("aria-current");
    }
  }

  replayAnimation(element, className) {
    if (!element) return;

    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  }

  replayMove(index) {
    this.replayAnimation(this.cells[index], "cell--placed");
    this.replayAnimation(this.status, "status--updated");
  }

  getWinningLineClass(line) {
    return WINNING_LINE_CLASSES[line.join(",")] || "";
  }

  setWinningLine(element, line) {
    if (!line?.length) return;

    element.className = `winning-line ${this.getWinningLineClass(line)}`;
    element.dataset.line = line.join(",");
    element.style.color = this.cells[line[0]]?.dataset.mark === "X" ? "#b42318" : "#175cd3";

    const firstCell = this.cells[line[0]];
    const lastCell = this.cells[line[line.length - 1]];
    const firstCenter = this.getCellCenter(firstCell);
    const lastCenter = this.getCellCenter(lastCell);

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

  getCellCenter(cell) {
    if (!cell || cell.offsetParent !== this.board || !cell.offsetWidth || !cell.offsetHeight) {
      return null;
    }

    return {
      x: cell.offsetLeft + cell.offsetWidth / 2,
      y: cell.offsetTop + cell.offsetHeight / 2
    };
  }

  cancelWinningLine() {
    this.winningAnimationId += 1;

    if (this.winningAnimationTimer !== null) {
      globalThis.clearTimeout(this.winningAnimationTimer);
      this.winningAnimationTimer = null;
    }
    this.winningAnimationCleanup?.();
    this.winningAnimationCleanup = null;

    if (this.winningLineElement) {
      this.winningLineElement.classList.remove("winning-line--active");
      this.winningLineElement.hidden = true;
    }
  }

  animateWinningLine(line) {
    if (!this.winningLineElement || !line?.length) return Promise.resolve();

    this.cancelWinningLine();
    const animationId = this.winningAnimationId;
    this.setWinningLine(this.winningLineElement, line);
    this.winningLineElement.hidden = false;
    const winningAnimationElement = this.winningLineElement;

    return new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished || animationId !== this.winningAnimationId) return;
        finished = true;
        if (this.winningAnimationTimer !== null) {
          globalThis.clearTimeout(this.winningAnimationTimer);
          this.winningAnimationTimer = null;
        }
        winningAnimationElement.removeEventListener("animationend", finish);
        this.winningAnimationCleanup = null;
        resolve();
      };

      this.winningAnimationCleanup = () => {
        winningAnimationElement.removeEventListener("animationend", finish);
        finished = true;
      };
      winningAnimationElement.addEventListener("animationend", finish);
      winningAnimationElement.classList.remove("winning-line--active");
      void winningAnimationElement.offsetWidth;
      winningAnimationElement.classList.add("winning-line--active");
      this.winningAnimationTimer = globalThis.setTimeout(finish, WINNING_LINE_DURATION);
    });
  }

  showLeaderboard(player, timestamp = this.now()) {
    if (!this.leaderboardScreen) return;
    this.homeScreen.hidden = true;
    this.gameScreen.hidden = true;
    this.leaderboardScreen.hidden = false;
    this.leaderboardOpen = true;
    this.currentLeaderboardPlayer = player;
    this.renderLeaderboard(player, timestamp, false);
    this.leaderboardList.scrollTop = 0;
    this.startLeaderboardLifecycle();
    this.leaderboardBack?.focus();
  }

  renderLeaderboard(player, timestamp = this.now(), preserveScroll = true) {
    if (!this.leaderboardList) return;
    const scrollTop = preserveScroll ? this.leaderboardList.scrollTop : 0;
    const standings = createStandings(timestamp, player);
    const fragment = this.document.createDocumentFragment();

    for (const entry of standings) {
      const row = this.document.createElement("div");
      row.className = `leaderboard-row${entry.type === "local" ? " leaderboard-row--local" : ""}`;
      row.setAttribute("role", "row");
      if (entry.type === "local") {
        row.id = "leaderboard-local-row";
        row.tabIndex = -1;
      }
      row.append(
        this.createLeaderboardCell(entry.rank ?? "—", "position"),
        this.createLeaderboardCell(entry.name, "player"),
        this.createLeaderboardCell(entry.score, "score")
      );
      fragment.append(row);
    }
    this.leaderboardList.replaceChildren(fragment);
    this.leaderboardList.scrollTop = scrollTop;
    const prelaunch = !getCycle(timestamp);
    if (this.leaderboardMessage) {
      this.leaderboardMessage.textContent = prelaunch ? "Starts Jan 4, 2026" : "";
      this.leaderboardMessage.hidden = !prelaunch;
    }
    this.renderFloatingLocalRow(standings.find(({ type }) => type === "local"));
    this.observeLocalRow();
  }

  createLeaderboardCell(value, column) {
    const cell = this.document.createElement("span");
    cell.className = `leaderboard-row__${column}`;
    cell.setAttribute("role", "cell");
    cell.textContent = String(value);
    return cell;
  }

  renderFloatingLocalRow(local) {
    if (!this.floatingLocalRow || !local) return;
    this.floatingLocalRow.replaceChildren(
      this.createLeaderboardCell(local.rank ?? "—", "position"),
      this.createLeaderboardCell(local.name, "player"),
      this.createLeaderboardCell(local.score, "score")
    );
  }

  startLeaderboardLifecycle() {
    this.stopLeaderboardLifecycle();
    const windowRef = this.document.defaultView;
    this.leaderboardList?.addEventListener("scroll", this.handleLeaderboardScroll);
    this.floatingLocalRow?.addEventListener("click", this.handleFloatingActivation);
    this.document.addEventListener("visibilitychange", this.handleVisibilityChange);
    windowRef?.addEventListener("storage", this.handleStorageChange);
    this.leaderboardInterval = windowRef?.setInterval(() => this.refreshLeaderboard(), 60_000) ?? null;
    this.observeLocalRow();
  }

  stopLeaderboardLifecycle() {
    const windowRef = this.document.defaultView;
    if (this.leaderboardInterval !== null) {
      windowRef?.clearInterval(this.leaderboardInterval);
      this.leaderboardInterval = null;
    }
    this.leaderboardObserver?.disconnect();
    this.leaderboardObserver = null;
    this.leaderboardList?.removeEventListener("scroll", this.handleLeaderboardScroll);
    this.floatingLocalRow?.removeEventListener("click", this.handleFloatingActivation);
    this.document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    windowRef?.removeEventListener("storage", this.handleStorageChange);
  }

  stopLeaderboard() {
    this.leaderboardOpen = false;
    this.stopLeaderboardLifecycle();
    if (this.leaderboardScreen) this.leaderboardScreen.hidden = true;
  }

  refreshLeaderboard(fromStorage = false) {
    if (!this.leaderboardOpen) return;
    this.currentLeaderboardPlayer = this.leaderboardRefreshHandler?.(fromStorage)
      || this.currentLeaderboardPlayer;
    this.renderLeaderboard(this.currentLeaderboardPlayer, this.now(), true);
  }

  observeLocalRow() {
    this.leaderboardObserver?.disconnect();
    const localRow = this.document.querySelector("#leaderboard-local-row");
    const IntersectionObserverRef = this.document.defaultView?.IntersectionObserver;
    if (IntersectionObserverRef && localRow) {
      this.leaderboardObserver = new IntersectionObserverRef((entries) => {
        const localEntry = entries.find(({ target }) => target === localRow);
        if (localEntry && this.floatingLocalRow) {
          this.floatingLocalRow.hidden = localEntry.isIntersecting;
        }
      }, { root: this.leaderboardList, threshold: 0.01 });
      this.leaderboardObserver.observe(localRow);
    }
    this.updateFloatingLocalRow();
  }

  updateFloatingLocalRow() {
    const row = this.document.querySelector("#leaderboard-local-row");
    if (!row || !this.leaderboardList || !this.floatingLocalRow) return;
    const listRect = this.leaderboardList.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const hasLayout = listRect.height > 0 || rowRect.height > 0;
    const visible = hasLayout
      ? rowRect.bottom > listRect.top && rowRect.top < listRect.bottom
      : this.leaderboardList.scrollTop === 0 && row === this.leaderboardList.firstElementChild;
    this.floatingLocalRow.hidden = visible;
  }

  getPageScale() {
    const inlineScale = this.gameRoot?.style.getPropertyValue("--page-scale");
    const computedScale = this.gameRoot
      ? this.document.defaultView?.getComputedStyle(this.gameRoot)?.getPropertyValue("--page-scale")
      : "";
    const scale = Number.parseFloat(inlineScale || computedScale || "");
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }

  jumpToLocalRow() {
    const row = this.document.querySelector("#leaderboard-local-row");
    const list = this.leaderboardList;
    if (!row || !list) return;

    const listRect = list.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const pageScale = this.getPageScale();
    const listHeight = list.clientHeight || listRect.height / pageScale;
    const rowHeight = row.offsetHeight || rowRect.height / pageScale;
    const rowTop = list.scrollTop + (rowRect.top - listRect.top) / pageScale;
    const targetScrollTop = rowTop - (listHeight - rowHeight) / 2;
    const reducedMotion = this.document.defaultView
      ?.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const behavior = reducedMotion ? "auto" : "smooth";

    if (typeof list.scrollTo === "function") {
      list.scrollTo({ top: targetScrollTop, behavior });
    } else {
      list.scrollTop = targetScrollTop;
    }
    row.focus({ preventScroll: true });
    this.updateFloatingLocalRow();
  }

  showHome(options = {}) {
    this.stopLeaderboard();
    [this.homeScreen, this.battlePassScreen, this.profileScreen, this.stylesScreen, this.gameScreen]
      .forEach((screen) => { if (screen) screen.hidden = screen !== this.homeScreen; });
    this.ensureHomeTitle();
    if (this.dailyGiftLauncher) this.dailyGiftLauncher.hidden = false;
    if (options.focusLeaderboard) this.leaderboardEntry?.focus();
    else if (options.focusBattlePass) this.battlePassEntry?.focus();
    else if (options.focusProfile) this.profileButton?.focus();
    else this.start?.focus();
  }

  showMatchmaking() {
    this.stopLeaderboard();
    this.closeDailyGift({ restoreFocus: false });
    this.homeScreen.hidden = true;
    this.gameScreen.hidden = true;
    if (this.dailyGiftLauncher) this.dailyGiftLauncher.hidden = true;
  }

  showGame() {
    this.stopLeaderboard();
    this.closeDailyGift({ restoreFocus: false });
    this.homeScreen.hidden = true;
    this.gameScreen.hidden = false;
    if (this.dailyGiftLauncher) this.dailyGiftLauncher.hidden = true;
  }

  showBattlePass(player, timestamp = this.now()) {
    this.stopLeaderboard();
    this.clearBattlePassVfx();
    this.battlePassHasRendered = false;
    this.renderBattlePass(player, timestamp);
    this.hideScreens(this.battlePassScreen);
    this.battlePassScreen?.classList.remove("battle-pass-screen--entering");
    void this.battlePassScreen?.offsetWidth;
    this.battlePassScreen?.classList.add("battle-pass-screen--entering");
    this.battlePassHeading?.focus();
    this.scrollBattlePassToTarget();
  }

  scrollBattlePassToTarget() {
    const list = this.battlePassList;
    const target = list?.querySelector("[data-battle-pass-target]");
    if (!list || !target) return;
    const reducedMotion = this.isReducedMotion();
    const behavior = reducedMotion ? "auto" : "smooth";
    const listRect = list.getBoundingClientRect?.();
    const targetRect = target.getBoundingClientRect?.();
    const listHeight = list.clientHeight || listRect?.height || 0;
    const targetHeight = target.offsetHeight || targetRect?.height || 0;
    const targetOffset = target.offsetTop || 0;
    const relativeTop = listRect && targetRect
      ? targetRect.top - listRect.top + list.scrollTop
      : targetOffset;
    const top = Math.max(0, relativeTop - Math.max(0, (listHeight - targetHeight) / 2));
    if (typeof list.scrollTo === "function") list.scrollTo({ top, behavior });
    else list.scrollTop = top;
  }

  hideScreens(active) {
    [this.homeScreen, this.battlePassScreen, this.profileScreen, this.stylesScreen, this.gameScreen]
      .forEach((screen) => { if (screen) screen.hidden = screen !== active; });
  }

  showProfile(player, options = {}) {
    this.renderProfile(player);
    this.hideScreens(this.profileScreen);
    (options.focusStyles ? this.stylesButton : this.profileHeading)?.focus();
  }

  showStyles() {
    this.hideScreens(this.stylesScreen);
    this.stylesHeading?.focus();
  }

  renderBattlePass(player = {}, timestamp = this.now()) {
    const cycle = getBattlePassCycle(timestamp);
    const count = BATTLE_PASS_MILESTONES.length;
    const points = Number.isInteger(player.battle_pass_points) && player.battle_pass_points >= 0
      ? Math.min(player.battle_pass_points, count) : 0;
    const claimed = new Set(Array.isArray(player.battle_pass_claimed)
      ? player.battle_pass_claimed : []);
    const target = points === count ? null : BATTLE_PASS_MILESTONES.find((item) =>
      item.points <= points && !claimed.has(item.milestone))
      || BATTLE_PASS_MILESTONES.find((item) => item.points > points) || null;
    const complete = points === count;
    const canClaim = Boolean(target && target.points <= points);

    if (this.battlePassProgress) this.battlePassProgress.textContent = `${points} / ${count} points`;
    if (this.battlePassReset) {
      this.battlePassReset.textContent = `Resets ${new Date(cycle.end).toISOString().slice(0, 10)}`;
    }
    if (this.battlePassTargetText) {
      this.battlePassTargetText.textContent = complete
        ? ""
        : `${Math.max(0, target.points - points)} points to milestone ${target.milestone}`;
    }
    if (this.battlePassKeepPlaying) {
      this.battlePassKeepPlaying.hidden = complete || canClaim;
    }
    if (this.battlePassComplete) this.battlePassComplete.hidden = !complete;
    if (this.battlePassPercent) this.battlePassPercent.textContent = `${points}%`;
    if (this.battlePassProgressBar) {
      this.battlePassProgressBar.setAttribute("aria-valuenow", String(points));
      this.battlePassProgressBar.setAttribute("aria-valuetext", `${points}% complete`);
    }
    if (this.battlePassProgressFill) {
      this.battlePassProgressFill.style.width = `${points}%`;
    }
    if (!this.battlePassList) return;

    const content = this.document.createElement("div");
    content.className = "battle-pass-scroll-content";
    const rail = this.document.createElement("div");
    rail.className = `battle-pass-rail${complete ? " battle-pass-rail--complete" : ""}`;
    rail.dataset.battlePassRail = "";
    rail.setAttribute("aria-hidden", "true");
    rail.setAttribute("role", "presentation");
    rail.style.setProperty("--battle-pass-fill", `${points}%`);
    const railFill = this.document.createElement("span");
    railFill.className = "battle-pass-rail__fill";
    railFill.dataset.battlePassProgressFill = "";
    railFill.setAttribute("aria-hidden", "true");
    rail.append(railFill);
    const cards = this.document.createElement("div");
    cards.className = "battle-pass-cards";

    BATTLE_PASS_MILESTONES.forEach((item, index) => {
      const reached = points >= item.points;
      const isClaimed = claimed.has(item.milestone);
      const isTarget = target?.milestone === item.milestone;
      const button = this.document.createElement("button");
      button.type = "button";
      button.className = `battle-pass-milestone battle-pass-milestone--${
        isClaimed ? "claimed" : reached ? "available" : "locked"
      }${isTarget ? " battle-pass-milestone--current" : ""}`;
      button.dataset.battlePassMilestone = String(item.milestone);
      if (isTarget) {
        button.dataset.battlePassTarget = "true";
        button.setAttribute("aria-current", "step");
      }
      button.disabled = isClaimed || !reached;
      button.setAttribute("aria-label", isClaimed
        ? `Milestone ${item.milestone}, claimed, ${item.reward} gold`
        : reached
          ? `Claim milestone ${item.milestone} for ${item.reward} gold`
          : `Milestone ${item.milestone}, locked, requires ${item.points} points`);

      const level = this.document.createElement("strong");
      level.className = "battle-pass-milestone__level";
      level.textContent = `Milestone ${item.milestone}`;
      const requirement = this.document.createElement("span");
      requirement.className = "battle-pass-milestone__requirement";
      requirement.textContent = `${item.points} point${item.points === 1 ? "" : "s"}`;
      const reward = this.document.createElement("span");
      reward.className = "battle-pass-milestone__reward";
      const coin = this.document.createElement("span");
      coin.className = "battle-pass-milestone__coin";
      coin.textContent = "¢";
      coin.setAttribute("aria-hidden", "true");
      coin.setAttribute("role", "presentation");
      const rewardLabel = this.document.createElement("span");
      rewardLabel.className = "battle-pass-milestone__reward-label";
      rewardLabel.textContent = `+${item.reward} gold`;
      reward.append(coin, rewardLabel);
      const action = this.document.createElement("span");
      action.className = "battle-pass-milestone__action";
      action.textContent = isClaimed ? "Claimed" : reached ? "Claim" : "Locked";
      button.append(level, requirement, reward, action);
      cards.append(button);

      const node = this.document.createElement("span");
      node.className = `battle-pass-rail__node${
        reached ? " battle-pass-rail__node--filled" : ""
      }${isTarget ? " battle-pass-rail__node--target" : ""}`;
      node.dataset.battlePassRailNode = String(item.milestone);
      node.style.setProperty("--battle-pass-node-index", String(index));
      node.setAttribute("aria-hidden", "true");
      node.setAttribute("role", "presentation");
      rail.append(node);
    });
    content.append(rail, cards);
    this.battlePassList.replaceChildren(content);
    if (!this.battlePassHasRendered) {
      this.battlePassList.classList.remove("battle-pass-list--entering");
      void this.battlePassList.offsetWidth;
      this.battlePassList.classList.add("battle-pass-list--entering");
      this.battlePassHasRendered = true;
    }
  }

  clearBattlePassVfx() {
    if (this.battlePassVfxTimer !== null) {
      globalThis.clearTimeout(this.battlePassVfxTimer);
      this.battlePassVfxTimer = null;
    }
    this.battlePassList?.querySelectorAll(".battle-pass-milestone--vfx, .battle-pass-rail__node--flare")
      .forEach((element) => element.classList.remove("battle-pass-milestone--vfx", "battle-pass-rail__node--flare"));
    this.battlePassList?.querySelectorAll("[data-battle-pass-particle]")
      .forEach((particle) => particle.remove());
  }

  triggerBattlePassVfx(milestone) {
    this.clearBattlePassVfx();
    if (this.isReducedMotion()) return;
    const card = this.battlePassList?.querySelector(
      `[data-battle-pass-milestone="${milestone}"]`
    );
    const node = this.battlePassList?.querySelector(
      `[data-battle-pass-rail-node="${milestone}"]`
    );
    if (!card) return;
    card.classList.add("battle-pass-milestone--vfx");
    node?.classList.add("battle-pass-rail__node--flare");
    for (let index = 0; index < 8; index += 1) {
      const particle = this.document.createElement("span");
      particle.className = `battle-pass-particle battle-pass-particle--${index % 4}`;
      particle.dataset.battlePassParticle = "";
      particle.setAttribute("aria-hidden", "true");
      particle.setAttribute("role", "presentation");
      particle.style.setProperty("--particle-angle", `${index * 45}deg`);
      card.append(particle);
    }
    this.battlePassVfxTimer = globalThis.setTimeout(() => {
      this.clearBattlePassVfx();
    }, 620);
  }

  announceBattlePass(message) {
    if (this.battlePassAnnouncement) this.battlePassAnnouncement.textContent = message;
  }

  renderProfile(player = {}) {
    if (this.profileName) this.profileName.textContent = player.player_name || "";
    const values = {
      games_played: player.games_played ?? 0,
      wins: player.wins ?? 0,
      draws: player.draws ?? 0,
      losses: player.losses ?? 0,
      moves_played: player.moves_played ?? 0,
      win_rate: `${player.games_played ? Math.round((player.wins || 0) / player.games_played * 100) : 0}%`
    };
    Object.entries(values).forEach(([key, value]) => {
      const target = this.profileScreen?.querySelector(`[data-stat="${key}"]`);
      if (target) target.textContent = String(value);
    });
  }

  createMiniPreview(style) {
    const preview = this.document.createElement("span");
    preview.className = "style-preview";
    preview.setAttribute("aria-hidden", "true");
    preview.style.cssText = styleTokens(style);
    ["X", "O", "", "", "X", "", "O", "", "X"].forEach((mark) => {
      const cell = this.document.createElement("span");
      cell.className = "style-preview-cell";
      cell.dataset.mark = mark;
      if (mark) cell.append(this.createMarkIcon(mark));
      preview.append(cell);
    });
    return preview;
  }

  renderStyles(player = {}) {
    const balance = Number.isInteger(player.coin_balance) ? player.coin_balance : 0;
    if (this.stylesBalanceAmount) this.stylesBalanceAmount.textContent = formatCoinBalance(balance);
    this.stylesBalance?.setAttribute("aria-label", `Coin balance: ${balance}`);
    if (!this.stylesGrid) return;

    const owned = Array.isArray(player.owned_styles) ? player.owned_styles : ["classic"];
    const catalogIds = new Set(BOARD_STYLES.map((style) => style.id));
    this.stylesGrid.querySelectorAll("[data-style-id]").forEach((tile) => {
      if (!catalogIds.has(tile.dataset.styleId)) tile.remove();
    });
    BOARD_STYLES.forEach((style) => {
      let tile = this.stylesGrid.querySelector(`[data-style-id="${style.id}"]`);
      const isNewTile = !tile;
      if (isNewTile) {
        tile = this.document.createElement("button");
        tile.type = "button";
        tile.className = "style-tile";
        tile.dataset.styleId = style.id;
      }
      const isEquipped = player.equipped_style === style.id;
      const isOwned = owned.includes(style.id);
      const shortfall = Math.max(0, style.price - balance);
      let state;
      let action;
      if (isEquipped) { state = "✓ Equipped"; action = "currently equipped"; }
      else if (isOwned) { state = "Owned"; action = "equip"; }
      else if (shortfall) { state = `¢ ${style.price} · Need ${shortfall} more`; action = `purchase; need ${shortfall} more coins`; }
      else { state = `¢ ${style.price}`; action = `purchase for ${style.price} coins`; }
      tile.setAttribute("aria-label", `${style.name}, ${action}`);
      const name = this.document.createElement("strong");
      name.textContent = style.name;
      const status = this.document.createElement("span");
      status.className = `style-state${isEquipped ? " style-state--equipped" : ""}`;
      status.textContent = state;
      tile.replaceChildren(name, this.createMiniPreview(style), status);
      if (isNewTile) this.stylesGrid.append(tile);
    });
  }

  applyBoardStyle(styleId) {
    const style = getBoardStyle(styleId);
    if (!this.gameRoot) return;
    this.gameRoot.dataset.boardStyle = style.id;
    for (const [token, value] of Object.entries({ boardColor: style.board, boardSurface: style.cell, cellColor: style.cell, cellBorderColor: style.border, xColor: style.x, oColor: style.o })) {
      this.gameRoot.style.setProperty(`--${token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, value);
    }
  }

  announceStyle(message) {
    if (this.styleAnnouncement) this.styleAnnouncement.textContent = message;
  }

  bindInsufficientDialog() {
    this.insufficientOk?.addEventListener("click", () => this.closeInsufficientCoins());
    this.insufficientDialog?.addEventListener("click", (event) => {
      if (event.target === this.insufficientDialog) this.closeInsufficientCoins();
    });
    this.insufficientDialog?.addEventListener("close", () => {
      const opener = this.insufficientOpener;
      this.insufficientOpener = null;
      opener?.focus();
    });
    this.insufficientDialog?.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.closeInsufficientCoins();
    });
  }

  showInsufficientCoins(style, shortfall, opener) {
    this.insufficientOpener = opener;
    if (this.insufficientMessage) this.insufficientMessage.textContent = `You need ${shortfall} more coins to unlock ${style.name}`;
    this.openDialog(this.insufficientDialog, this.insufficientOk);
  }

  closeInsufficientCoins() {
    const opener = this.insufficientOpener;
    this.closeDialog(this.insufficientDialog);
    this.insufficientOpener = null;
    opener?.focus();
  }

  focusFirstCell() {
    this.cells[0]?.focus();
  }

  openResultDialog(state) {
    if ((!state.winner && !state.draw) || !this.resultDialog || this.resultDialog.open) return;

    this.resultMessage.textContent = state.winner
      ? (state.winner === "X" ? "You won!" : "Computer won!")
      : "Draw";
    if (this.resultDetail) {
      this.resultDetail.textContent = state.winner
        ? "Three in a row!"
        : "No spaces left on the board.";
    }
    this.openDialog(this.resultDialog, this.continueButton);
  }

  closeResultDialog() {
    this.closeDialog(this.resultDialog);
  }

  openMatchmakingDialog() {
    this.openDialog(this.matchmakingDialog);
  }

  closeMatchmakingDialog() {
    this.closeDialog(this.matchmakingDialog);
  }

  openDialog(dialog, focusTarget) {
    if (!dialog) return;

    if (typeof dialog.showModal === "function") {
      try {
        dialog.showModal();
        focusTarget?.focus();
        return;
      } catch {
        // jsdom does not implement showModal; the open attribute is a fallback.
      }
    }

    dialog.setAttribute("open", "");
    focusTarget?.focus();
  }

  closeDialog(dialog) {
    if (!dialog) return;

    if (typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }

  resetFeedback() {
    this.cancelWinningLine();
    this.gameRoot?.classList.remove("game--celebrating");
    this.board?.classList.remove("board--winner", "board--draw");
    this.status.classList.remove("status--winner", "status--draw", "status--updated");
  }
}

export { WINNING_LINE_DURATION };
