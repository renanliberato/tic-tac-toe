# Add a persistent three-flame match win streak and streak coin bonus

## Goal

Add a quiet win-streak feature to the home screen. Show three inline SVG fire icons at the upper-right of the Start game button, overlapping its top edge so the flames sit approximately half inside and half outside the button. Consecutive overall first-to-three match wins fill the flames from left to right; an overall match loss clears them. Reaching three consecutive wins, and every later consecutive win while the streak remains capped at three, adds one bonus coin to the existing three-coin match-win reward.

Do not add a tutorial, visible explanation, tooltip, bonus-specific copy, sound, or extra celebration.

## Repository context

- This is a dependency-free browser app using plain HTML, CSS, and ES modules under `public/`.
- `public/js/player.js` owns normalized local-player state and persists it under the `tic-tac-toe-player` local-storage key, with an in-memory fallback when browser storage is unavailable. Profile fields use snake_case. Invalid count fields currently normalize through `asCount`.
- `public/js/controller.js` implements overall first-to-three matches with `MATCH_POINTS_TO_WIN = 3`. `recordResult()` runs for each completed board, determines when that board produces the decisive overall match result, and uses `resultRecorded` to avoid recording a board result twice.
- The local player is `X`; the opponent is `O`. On the decisive local match win, `recordResult()` currently calls `awardCoins(this.player, 3)`. Intermediate board wins do not award coins.
- `public/js/player.js` stores both `coin_balance` and `pending_coins`. `awardCoins()` adds the same amount to both. Pending coins drive the existing one-time home-screen flying-coin presentation and its screen-reader announcement.
- The result dialog's Continue action calls `showHome()`. `enterHomePresentation()`/`GameView.enterHome()` own home-entry reward presentation, and the controller invokes that path both at initial construction and after returning home.
- `public/index.html` contains `#home-screen` and its `#start-game` button (`aria-label="Play"`, visible text `Start game`).
- `public/js/view.js` owns DOM rendering and screen transitions. `render()` already receives the normalized player profile.
- `public/css/styles.css` uses a fixed 1125 x 2436 design canvas scaled to fit the viewport. The home panel is 760 px wide and the Start game button is currently scaled for the design. Follow `AGENTS.md`: prefer PaperCSS defaults, and scope necessary custom styles beneath `.game`.
- Automated coverage uses Vitest/jsdom and Cucumber via `npm test`, with ESLint via `npm run lint`.

## Functional requirements

### 1. Persisted streak state and migration

Extend the normalized player profile with one field representing the displayed consecutive overall match-win streak (use the existing snake_case convention, e.g. `win_streak`).

- New players start at `0`.
- Persist the streak through the existing player storage mechanism so it survives reloads and browser restarts and works with the existing in-memory fallback.
- Existing valid profiles without the field migrate to `0` and retain all other data currently preserved by normalization.
- Normalize missing, negative, non-integer, non-numeric, or otherwise invalid streak values to `0`.
- Clamp valid integer values greater than `3` to `3`.
- Persisted streak state and the three-flame UI must therefore always use an integer from `0` through `3`.

### 2. Streak boundary and result rules

The streak is based only on the outcome of a complete first-to-three match, not individual tic-tac-toe boards/rounds.

- On the decisive board that gives local `X` an overall match win, increment the streak by one, capped at `3`.
- On the decisive board that gives opponent `O` an overall match win, reset the streak to `0`.
- Intermediate X or O board wins and drawn boards do not alter the streak.
- Starting a match, progressing to another board, returning home before a match completes, reloading, or closing the page during an incomplete match leaves the streak unchanged. An abandoned/incomplete match is not a loss.
- Apply each decisive match result at most once, preserving the controller's existing duplicate-result protection.
- Make the updated streak durable immediately when the decisive match result is recorded. Do not wait for the winning-line animation, result dialog, Continue action, home navigation, or reward presentation.

Do not change the meaning of existing `wins`, `draws`, and `losses`; those fields currently track individual board results and must continue to do so.

### 3. Coin reward rule

Preserve the normal three-coin reward for every overall local match win and add exactly one streak coin when the just-recorded win brings the streak to `3` or when it was already capped at `3`.

Therefore:

- First consecutive overall win: streak `1`, award `3` coins total.
- Second consecutive overall win: streak `2`, award `3` coins total.
- Third consecutive overall win: streak `3`, award `4` coins total.
- Every subsequent overall win before a loss: streak remains `3`, award `4` coins total each time.
- Overall opponent win: streak `0`, award no coins.
- Intermediate boards and draws: no match reward and no streak bonus.

Persist the decisive streak update together with the corresponding coin state as part of handling that result so a reload cannot retain one side of a completed result while losing the other. Keep currency mutation in the player domain rather than duplicating raw `coin_balance`/`pending_coins` arithmetic in the view.

The extra coin uses the existing reward flow:

- Add four to both `coin_balance` and `pending_coins` on an eligible streak win, exactly as an ordinary match win adds three.
- Let the existing home-screen coin presentation show and announce the combined pending amount (for example, `4 coins earned; balance N`).
- Do not identify the extra coin separately in the result dialog, coin announcement, or any new visible/accessibility copy.

### 4. Three-flame indicator

Add a non-interactive three-flame indicator associated visually with the Start game button on the home screen.

- Use self-contained inline SVG artwork; do not add an image file, icon package, or runtime dependency.
- Render exactly three recognizable flames in a horizontal group.
- Keep a dark, hand-drawn-style outline visible on all three flames, fitting the app's PaperCSS aesthetic.
- Unearned flames have transparent interiors (outline only).
- Earned flames retain the dark outline and use a warm orange-to-red fire fill treatment.
- Fill earned flames from left to right according to streak values `0`, `1`, `2`, and `3`.
- Place the group at the Start game button's upper-right. Overlap the button's top edge so each flame is approximately half above and half inside it.
- Keep the complete group horizontally readable, within the home panel, and unclipped on narrow supported viewport sizes/scales.
- The artwork is status only: it must not respond to pointer or keyboard interaction and must not interfere with activating the Start game button.
- Update the displayed fill state when entering/returning to the home screen, including correct rendering on initial page load from persisted state. The indicator does not need to visibly update behind the game or result screens.
- Add no transition, fill animation, pulse, particles, or other streak celebration. State changes should simply appear when home is shown.

### 5. Accessibility and copy constraints

- Expose one concise status for the indicator in the form `Win streak: N of 3`, reflecting the normalized displayed streak.
- Treat the individual SVG paths/flames as decorative (`aria-hidden`/non-focusable as appropriate) so assistive technology does not announce three redundant images.
- Do not alter the Start game's existing accessible name of `Play`.
- Add no visible streak label, tooltip, tutorial, help text, reward explanation, bonus-specific result text, or other explanatory copy.
- Keep existing coin accessibility behavior. A four-coin streak reward should be announced only through the generalized existing coin completion announcement, not through an additional streak announcement.

## Implementation guidance and constraints

- Keep responsibilities separated:
  - profile defaults, normalization, persistence, and focused streak/reward state operations in `public/js/player.js`;
  - decisive overall match orchestration in `public/js/controller.js`;
  - streak DOM rendering/accessibility in `public/js/view.js` and/or stable markup in `public/index.html`;
  - layout and flame appearance in `public/css/styles.css`.
- Reuse the existing decisive-match calculation in `recordResult()`; do not infer streak changes from per-board statistics or from result-dialog timing.
- Ensure the decisive O match path now records the reset even though that path awards no coins.
- Preserve `resultRecorded` idempotency so repeated calls for the same decisive board cannot increment/reset twice or duplicate currency.
- Avoid coupling streak rendering to the flying-coin timers. The flames should show persisted streak state immediately upon home entry, while the existing coin presentation can continue independently.
- Account for constructor-time initial home rendering as well as the Continue-to-home path.
- Keep custom CSS scoped under `.game`, avoid global PaperCSS overrides, and account for the Start button's existing transform/scale when positioning the overlay.
- Preserve matchmaking, first-to-three scoring, automatic next-round behavior, per-board player statistics, result and matchmaking dialogs, winning-line animation, coin backlog/interruption/reduced-motion behavior, focus behavior, and page scaling.
- Add no runtime dependencies.

## Acceptance criteria

1. A new player has a persisted normalized streak of `0`; existing profiles missing the field migrate to `0` without losing existing normalized data.
2. Invalid, negative, fractional, or non-numeric persisted streaks normalize to `0`, while valid integers above `3` normalize to `3`.
3. Intermediate board wins by either side and drawn boards leave the streak unchanged. Starting or abandoning an incomplete match also leaves it unchanged.
4. A decisive overall X win immediately and durably changes streak `0 -> 1`, `1 -> 2`, and `2 -> 3`; another consecutive win leaves it at `3`.
5. A decisive overall O win immediately and durably resets any streak (`1`, `2`, or `3`) to `0` and awards no coins.
6. The decisive result is applied exactly once even if result handling is invoked repeatedly for the same board.
7. Overall X wins that produce streak `1` or `2` add exactly `3` to both durable and pending coin state. The win that produces streak `3`, and every later win while capped at `3`, adds exactly `4` to each.
8. Reloading immediately after a decisive result retains both the correct streak and coin state; reloading or closing during an incomplete match does not change the streak.
9. The home screen always shows three inline SVG flames at the Start button's upper-right, approximately half inside/half outside its top edge, without clipping or blocking the button.
10. At streak `0`, all flames are dark outlines with transparent interiors. At `1`, `2`, and `3`, that many flames are warm orange-to-red filled from left to right while retaining their outlines.
11. Initial page load and each return home render the persisted streak. There is no streak animation or other additional celebration.
12. The group is non-interactive, individual SVG artwork is hidden from assistive technology, and a single status exposes exactly `Win streak: N of 3`; the Start button remains named `Play`.
13. A four-coin reward uses the current combined home coin presentation and generalized completion announcement. No visible or accessible bonus-specific explanation is added to the result dialog or elsewhere.
14. Focused automated tests cover profile creation/migration/normalization/clamping, decisive-match increment/reset/idempotency, abandonment and intermediate-board non-effects, three-versus-four coin eligibility, all four flame render states, accessibility, and overlay styling. Existing tests continue to pass, `npm test` passes, and `npm run lint` passes.

## Out of scope

- Tutorials, onboarding, tooltips, visible labels, or explanatory copy
- New result-dialog messaging or a separate streak-bonus announcement
- Streak/fill/celebration animation, particles, sound, or haptics
- More than three displayed or persisted streak levels
- Penalties for abandoning an incomplete match
- Coin spending, store, purchase, or monetization changes
- Changes to first-to-three match rules or existing per-board statistics semantics
