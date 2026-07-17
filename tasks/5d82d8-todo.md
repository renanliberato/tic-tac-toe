# Implement first-to-3 tic-tac-toe matches

## Objective

Change the game from a single-board session into a match in which the first player to win 3 tic-tac-toe boards wins the match.

## Current implementation context

- The browser app is under `public/` and uses an MVC-style split:
  - `public/js/game.js` contains board rules and winning-line detection.
  - `public/js/model.js` owns the current board state and publishes updates.
  - `public/js/controller.js` coordinates matchmaking, moves, result handling, and player statistics.
  - `public/js/view.js` renders the board, player cards, feedback, winning-line animation, and dialogs.
  - `public/js/player.js` persists player statistics under `tic-tac-toe-player`.
  - `public/index.html` defines the game screen, player cards, board, matchmaking dialog, and result dialog.
  - `public/css/styles.css` defines the player-card and game-screen layout.
- A board currently has `board`, `player`, `winner`, and `draw` state; X is the local player and O is the opponent.
- The current result dialog displays the existing board result (`X Won`/`O Won` or `Draw`) and the existing detail text, with a `Continue` button that returns home.
- A winning board already animates its winning line for `WINNING_LINE_DURATION` (700 ms) before the result dialog is shown.
- Existing tests include Vitest unit/MVC tests and Cucumber browser-flow tests under `tests/`.

## Required behavior

### Match and round rules

1. Starting a game starts a new first-to-3 match and initializes both match scores to zero.
2. Each tic-tac-toe board is one round. Award exactly one match point to the player who wins that board.
3. A full-board draw awards no match points.
4. After every non-final board result, automatically begin the next round without requiring the user to click a result-dialog action:
   - For a win, keep the existing winning-line animation visible and begin the next board after that animation completes.
   - For a draw, begin the next board automatically once the round is complete.
   - The next board must be empty, retain the current match score, preserve X/O assignments, and have X's turn.
   - There must be no intermediate result dialog blocking this automatic transition.
5. End the match immediately when either player reaches 3 points. Do not start another board after that point.
6. For the final board, preserve the current result-dialog messaging rather than introducing a final-score-specific message. The existing winner text/detail (for example, `X Won` and `Three in a row!`) should be shown after the winning-line animation, and `Continue` should return to the home screen. The final score does not need to be included in the dialog.
7. Keep the current board rules, move rejection, turn behavior, winning-line geometry/animation, accessibility labels, and X-as-local/O-as-opponent identity behavior unless changes are necessary to support the match.

### Scoreboard UI

- Show each player's current match score inside that player's player box/card.
- Rearrange the card content so the role label and player name are grouped to the side and the two scores sit near each other, matching the requested visual arrangement conceptually:
  - local card: `[You / captain    1]`
  - opponent card: `[0    Opponent / neeon]`
- Keep both player names and role labels visible, retain the existing local/opponent and X/O semantics, and update the score immediately after a round win.
- Scores reset to `0–0` when a new match starts.
- The scoreboard may remain visible with the final match score while the final result dialog is open; the dialog itself does not need to display the score.

### Player statistics and persistence

- Continue using the existing player-statistics schema and persistence mechanism.
- Count/bookkeep each board round using the existing per-game statistics behavior; a first-to-3 match must not become one new match-level statistic and must not silently replace round-level results.
- Each started round should receive the normal existing game-start bookkeeping, and each completed round should record its win/draw/loss exactly once.
- Do not add match-level statistics or change the meaning of the existing stored fields.
- Match score and current match/round progress should remain in memory only. A page reload or browser restart may discard an in-progress match and reset its score; persisted player statistics remain persisted.

## Implementation guidance

- Extend the controller/model/view contract with match score and round lifecycle state rather than treating the match as a single board result.
- Ensure result recording is guarded per round, not just per match, so every completed board is recorded once and no result is recorded twice during the animation/automatic reset.
- Make the automatic transition safe against stale winning-line animation callbacks and against user clicks while a completed round is waiting for its animation; completed-board cells must remain disabled until the next round is initialized.
- Preserve the existing matchmaking flow: matchmaking completes before the first round becomes playable, and starting a fresh match clears old match state.
- Update markup/styles as needed for the score placement while preserving responsive/scaled layout and accessibility.

## Acceptance criteria

- A newly started match renders both player scores as `0`.
- A local X win changes the match score by exactly one for X; an O win changes exactly one for O; a draw changes neither score.
- A non-final win displays the existing winning-line animation, then automatically renders a fresh empty board with the retained score and X to move, without a result dialog or user action.
- A draw automatically proceeds to a fresh round with the retained score and X to move.
- At 3 points, the match stops immediately: no fourth board starts, the completed board remains finished, and the existing result dialog is shown after the normal winning-line animation. `Continue` returns home.
- Starting a new match after returning home resets the match score to `0–0`.
- X remains the local player and starts every round; O remains the opponent every round.
- Player statistics reflect each board round exactly once, including wins, losses, draws, moves, `games_played`, and `last_move` according to the existing schema; no match-level field is introduced.
- Reloading during a match does not restore its in-memory score, while the existing persisted player statistics remain available.
- Existing board behavior, result wording, winning-line behavior, accessibility, matchmaking, and current tests continue to work, with new unit/MVC and end-to-end coverage for match scoring, automatic transitions, final termination, and per-round statistics.
