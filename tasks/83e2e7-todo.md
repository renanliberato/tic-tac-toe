# Replace manual Player 2 turns with a random AI opponent

## Goal

Change gameplay from a shared-board two-player experience into a human-versus-computer game. The local human always plays `X` and starts every round. The computer always plays `O` and, after a short delay, chooses uniformly from the currently free cells with no strategy, win detection, blocking, opening preference, or loss avoidance.

Keep the established first-to-three match, round statistics, score cards, board transitions, winning-line behavior, and 3-coin overall-match reward. Starting a local computer match must be immediate rather than showing the simulated matchmaking queue.

## Repository context

- This is a dependency-free browser app using plain HTML, CSS, and ES modules under `public/`.
- `public/js/game.js` contains the pure tic-tac-toe state and alternates `state.player` between `X` and `O` after accepted moves.
- `public/js/model.js` wraps that state and notifies subscribers after `makeMove` and `reset`.
- `public/js/controller.js` coordinates player input, matchmaking, round completion, first-to-three scoring, profile updates, rewards, and screen transitions. Currently every cell click calls the same `play(index)` path, so a person manually supplies both X and O moves. It also waits `MATCHMAKING_DURATION` (3 seconds) and creates a generated fake opponent identity before starting.
- `public/js/view.js` currently enables any unoccupied cell while a game is active, displays mark-oriented messages such as `Player X's turn`, and renders the generated opponent name.
- `public/js/player.js` persists local-player statistics under `tic-tac-toe-player`. `updatePlayerAfterMove` increments `moves_played` and sets `last_move`; these fields describe only the local human after this change.
- `public/index.html` labels the second card as `Opponent` and includes the obsolete matchmaking dialog.
- Existing automated coverage uses Vitest/jsdom and Cucumber. Many current tests manually click alternating X and O cells and assert matchmaking/player-mark wording, so they must be rewritten around controlled randomness and timers.

## Functional requirements

### 1. Fixed participants and marks

- The local human is always `X` and takes the first turn in every round, including all automatically reset rounds in the first-to-three match.
- The computer is always `O`.
- Replace the generated fake-player presentation with a fixed opponent identity:
  - name: `Computer`
  - role label: `AI Opponent`
- Do not present the computer as “Player 2,” a remote person, or a generated friendly nickname.
- Keep X/O marks on the board and keep the existing human profile/friendly name for the local player.

### 2. Start immediately without matchmaking

- Activating **Start game** must begin the local AI match immediately.
- Do not show or wait for the current 3-second “finding an opponent”/quick-play queue dialog.
- Preserve the existing start-of-match effects: finish any in-progress coin presentation, close/reset stale result feedback, reset match scores and board state, count the first round in local `games_played`, show the game screen, and focus the first playable cell.
- Direct/internal game-start paths should establish the same fixed Computer identity and behavior.
- Obsolete matchmaking code and markup may be removed or simplified; no user-visible matchmaking copy or delay should remain.

### 3. Human-turn input rules

- A board click may place a mark only while:
  - a game is active;
  - the current model turn is `X`;
  - the round is not complete; and
  - the selected cell is free.
- A valid human click places exactly one `X`.
- Ignore clicks on occupied cells, clicks while it is the computer's turn or delay, rapid repeated clicks, and clicks after a round/match has completed.
- After a valid non-terminal X move, lock **all** board cells until the computer move finishes. The human must never be able to place `O` or make consecutive X moves.
- If the human move wins the round or fills the board for a draw, do not schedule a computer move.

### 4. Random computer move

- After each valid human move that leaves the round active, wait a fixed approximately 500 ms, then place one `O` in a free cell.
- At execution time, derive the list of all cells that are still free and select uniformly by index from that list. Every free cell must have an equal probability.
- The AI must have no tactical logic: no checks for immediate AI wins, human threats, blocks, forks, preferred corners/center, openings, or any other board evaluation.
- Make the random source controllable/injectable at the orchestration boundary (or use an equivalently deterministic test seam) so tests can select exact free cells without flaky probability assertions. Production behavior should use normal random values.
- Run the computer move through the model's normal move operation so winner/draw detection and rendering remain centralized.
- Animate/replay the placed O consistently with a human mark, then process an O win or draw through the same round-result and round-transition flow used for X outcomes.
- Never attempt an AI move when there are no free cells.

### 5. Delayed-action lifecycle safety

- Track the pending AI timeout explicitly.
- Cancel or invalidate a pending computer move whenever its game/round is no longer current, including returning home, starting/restarting a match, completing a round by another path, or resetting the board.
- A stale callback must not place an O on a new board, mutate statistics or scores, open a result dialog, or steal focus.
- Preserve/use the controller's existing round identity guards as appropriate, but also clear timer resources where possible.
- Ensure at most one AI timeout and one AI move can result from each accepted human move.

### 6. AI-aware messaging and accessibility

Use participant-oriented messaging rather than generic Player X/Player O wording:

- At the beginning of an active round and after the AI completes a non-terminal move: `Your turn`.
- During the delay before the AI places O: `Computer is thinking…`.
- For an X round or match win: `You won!`.
- For an O round or match win: `Computer won!`.
- Draw feedback remains clearly identified as a draw (the existing `It's a draw!` wording is acceptable).

Apply the same meaning to visible status/result copy and the polite turn announcement as applicable; do not leave contradictory `Player X`, `Player O`, or `O Won` messages in user-facing gameplay/results.

- While `Computer is thinking…` is announced, the Computer/AI card should be the active-turn card and the entire board must be disabled.
- During `Your turn`, the human card should be active and only currently free cells should be enabled.
- Keep cell accessible labels and X/O mark identification intact.
- Update score accessibility labels to refer to the human and Computer rather than a generic opponent where appropriate.

### 7. Match, round, statistics, and reward preservation

Preserve the existing match rules and surrounding behavior:

- A match remains first to 3 round wins, with separate persistent-on-screen X and O score cards.
- After a non-final win, retain the winning-line animation and automatically reset to a fresh round. Draws also automatically start a fresh round. Each fresh round starts with the human as X.
- Continue recording one `games_played` for each started round and one win/draw/loss result for each completed round exactly once.
- An overall match win still opens the result dialog after the existing winning-line flow.
- Award exactly 3 coins when and only when the human/X wins the overall first-to-three match, preserving the current pending-coin and home-screen celebration behavior.
- An overall Computer/O win awards no coins.
- Only accepted human X moves increment the persisted local profile's `moves_played` and update `last_move`.
- Automatic O moves must not increment `moves_played` and must not replace `last_move`; after any computer action, `last_move` remains the human's most recent X move.

## Implementation constraints

- Maintain the existing model/view/controller split: board rules stay in the game/model layer, turn orchestration and delayed AI actions in the controller, persistence in `player.js`, and DOM messaging/control state in the view.
- Avoid duplicating terminal-result handling between human and AI paths; both participants' accepted moves should consistently trigger result recording, score updates, animations, and round/match transitions.
- The view needs enough explicit turn/AI-pending state to disable the complete board during the computer delay; `gameStarted` and occupied/terminal state alone are currently insufficient.
- Use the existing injected timer seam in `GameController` for the AI delay, and add a deterministic randomness seam suitable for unit tests.
- Preserve home navigation, result-dialog guards, coin presentation, responsive layout/scaling, winning-line geometry, focus behavior, and storage fallback behavior.
- Add no runtime dependencies. Follow `AGENTS.md`: prefer PaperCSS defaults and keep any necessary styling scoped to the game.

## Acceptance criteria

1. Clicking **Start game** immediately shows an empty active board; no matchmaking dialog or 3-second delay appears. The human is X, the Computer is O, and the human has the first turn.
2. The opponent card always shows `Computer` with role `AI Opponent`; it does not show a generated nickname or imply a second human player.
3. A valid human move places one X, increments the local move count once, changes messaging to `Computer is thinking…`, activates the Computer card, and disables every cell for approximately 500 ms.
4. Extra/rapid clicks during the computer delay are ignored and cannot place O or a second X.
5. When the delay expires, exactly one O is placed in one of the cells that is free at execution time. With controlled random values, tests demonstrate selection across the free-cell list, including its first and last entries, without tactical overrides.
6. The AI does not block a forced human win or choose a winning move unless that cell happens to be selected randomly; no strategy or board evaluation affects selection.
7. After a non-terminal O move, messaging returns to `Your turn`, the human card becomes active, and only free cells are enabled.
8. A terminal human move schedules no AI action. A terminal AI move records the Computer win or draw correctly, disables the board, and follows the existing animation/next-round or final-result flow.
9. Returning home or otherwise changing/resetting the round before the timeout expires prevents the stale AI callback from changing the new/current board, score, profile, dialog, or focus.
10. Round and result messaging uses `Your turn`, `Computer is thinking…`, `You won!`, and `Computer won!` as applicable, with draw messaging retained and accessible live feedback consistent with the visible state.
11. Across automatic O moves, local `moves_played` counts only X marks and `last_move` remains the most recent X cell/mark. Per-round `games_played` and win/draw/loss statistics remain correct and are recorded once.
12. First-to-three scores persist across automatic round resets and reset for a new match. A decisive human match win still awards exactly 3 coins; Computer wins and draws do not award coins.
13. Automated tests cover immediate start, fixed AI identity, board locking, deterministic random-free-cell choice, no-strategy behavior, terminal moves, timeout cancellation/stale callbacks, AI-aware messages/accessibility, statistics, scoring, and rewards. Existing affected manual-two-player/matchmaking tests are updated, and `npm test` plus `npm run lint` pass.

## Out of scope

- Minimax, heuristics, difficulty levels, adaptive play, win/block detection, or any other intelligent AI behavior
- Mark selection, alternating starting player, or letting the Computer play X/start a round
- Online multiplayer, matchmaking, generated AI personas, or multiple opponent choices
- Changing first-to-three scoring, per-round statistics semantics, coin values, reward presentation, or broader visual redesign
- AI move sounds, haptics, or configurable delay
