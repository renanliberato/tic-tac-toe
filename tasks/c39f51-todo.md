# Add persistent match-win coins and a home-screen coin celebration

## Goal

Add an uncapped coin balance to the persisted local-player profile. Show that balance in a four-digit coin holder at the top center of the home screen. When the local player wins an overall first-to-three match, durably award 3 coins immediately, then present those pending coins the next time the home screen is entered by rotating and flying them into the holder while its displayed amount counts up.

## Repository context

- This is a dependency-free browser app using plain HTML, CSS, and ES modules under `public/`.
- `public/js/player.js` owns the local player profile, normalizes it, and persists it under the `tic-tac-toe-player` local-storage key, with an in-memory fallback when storage is unavailable.
- `public/js/controller.js` already implements first-to-three matches (`MATCH_POINTS_TO_WIN = 3`). Individual board results are recorded in `recordResult`; a final match result is shown after the winning-line animation. The result dialog's Continue action calls `showHome()`.
- `public/js/view.js` owns DOM rendering and screen transitions. The app initially loads with the home screen visible; this initial load must count as entering home for a reward left pending across reload/browser restart.
- `public/index.html` contains `#home-screen`, whose current first visible item is `#home-title`, followed by the animated board preview and Start game button.
- `public/css/styles.css` uses a fixed 1125 × 2436 design canvas scaled to the viewport. Follow `AGENTS.md`: prefer PaperCSS defaults and keep necessary custom styles scoped beneath `.game`.
- Existing automated coverage uses Vitest/jsdom plus Cucumber (`npm test`) and ESLint (`npm run lint`).

## Functional requirements

### 1. Player profile and persistence

Extend the normalized persisted player profile with non-negative integer state sufficient to represent:

- the player's true, durable coin balance; and
- earned coins that have not yet completed their one-time home-screen presentation.

Use clear field names (for example, `coin_balance` and `pending_coins`; exact naming may follow existing snake_case conventions).

- New players start with a balance of `0` and no pending coins.
- Migrate existing valid stored profiles that lack the new fields by normalizing both values to `0`, while preserving all existing profile data handled by the current normalizer.
- Invalid, missing, negative, or non-integer coin values normalize safely to `0`, consistent with existing count fields.
- Keep the durable balance uncapped. Do **not** clamp persisted currency at 9,999.
- Persist both the balance and pending-presentation state through the existing profile storage mechanism, including its in-memory fallback behavior.
- Provide focused player-domain operations for awarding coins and consuming pending presentation state rather than scattering raw profile mutations through the controller/view.

### 2. Award rules

Award exactly **3 coins** only when the local `X` player wins the **overall first-to-three match**.

- Do not award coins for intermediate board/round wins.
- Do not award coins for draws or an overall opponent (`O`) victory.
- Award at most once for a given completed match.
- As soon as the decisive local match win is recorded, atomically add 3 to both the durable balance and the pending-presentation amount and save the profile. Do not wait for Continue, animation completion, or a later page lifecycle event to make the currency durable.
- Preserve the existing per-board statistics behavior; the current `wins`, `draws`, and `losses` fields continue to describe board results unless independently changed by other work.

### 3. Home coin holder

Add a holder laid out visually as:

`[coin icon] [amount] [plus icon]`

- Place it inside `#home-screen`, centered at the top, above `TIC TAC TOE`.
- Move the title down enough to make the new hierarchy deliberate without breaking the existing home preview, Start game placement, fixed design canvas, or responsive scaling.
- Give the amount area a stable width for exactly four visible digits.
- Render values from 0 through 9,999 with leading zeroes (`0000`, `0010`, `9999`).
- When the true balance is greater than 9,999, keep the visible amount capped at `9999`; do not expand to a fifth digit and do not alter the true persisted balance.
- The plus icon is decorative and non-interactive. It must not look or behave like an enabled purchase button and must not be keyboard-focusable.
- Use self-contained inline SVG and/or CSS for the coin and plus artwork. Use a gold, hand-drawn treatment compatible with the existing PaperCSS aesthetic; add no image/icon package or network dependency.
- This task exposes coins only in this home holder. Do not add a separate profile/statistics screen, store, purchase flow, or spending flow.

### 4. Pending-reward presentation

On every home entry—including initial app load—check the persisted pending amount.

If no coins are pending, render the current balance normally and do not run a reward animation. If coins are pending:

1. The reward is already included in the durable balance.
2. Initially render the pre-reward presented balance (`durable balance - pending amount`, safely bounded to a non-negative value and visually capped as described above).
3. Spawn decorative coins around the lower-middle/center of the visible home panel, near the board preview.
4. Fly them toward the live position of the top-center holder.
5. Increase the presented amount as coins arrive until it reaches the durable balance (subject only to the visible `9999` cap).
6. On successful completion, persist that all pending coins were presented and remove all temporary flying-coin elements.

For a normal +3 reward:

- Render three separate flying coins.
- Stagger them by approximately 150 ms.
- Each arrival adds 1 to the presented amount.
- Target approximately 1.4 seconds for the complete celebration.

Motion details:

- Each flying coin repeatedly rotates around its Y axis to appear three-dimensional.
- X and Y translation must be independently animatable so they can use different timing functions without transform collisions.
- Use out-back easing on X and in-back easing on Y, matching the requested overshoot/back motion.
- Calculate travel against actual rendered geometry so coins terminate at the holder under the app's viewport scaling rather than relying on brittle page coordinates.
- Flying coins are decorative, cannot capture pointer input, and are hidden from assistive technology.
- Do not add sound or haptic feedback.

### 5. Backlogs and the 20-icon limit

Pending state may represent multiple unpresented wins (for example, after reloads or future integrations). Never create more than **20 flying coin elements** for one home presentation.

- For 20 or fewer pending coins, animate one icon per pending coin and increment by 1 at each arrival.
- For more than 20 pending coins, animate exactly 20 icons. The first 19 arrivals each add 1; the final arrival applies the entire remainder so the presented balance reaches the true durable balance.
- Keep the whole backlog celebration near 1.4 seconds by dynamically tightening the stagger as icon count grows rather than making the sequence increasingly long.
- If the visible amount reaches `9999`, continue celebrating all represented pending coins while leaving the visible digits at `9999`. Consume the full pending amount at completion.

### 6. Interruption and replay safety

- If Start game is activated while the reward animation is running, do not block play: synchronously finalize the presentation first, show the final visually capped balance, remove flying coins, persist pending coins as consumed, then continue into the existing matchmaking flow.
- Ensure completion/finalization is idempotent so timer/animation callbacks cannot decrement pending state twice, regress the displayed value, create duplicate announcements, or interfere with a newer presentation.
- Reloading or closing before pending state is consumed may replay the visual presentation on the next home entry, but it must never award another 3 coins. Once consumed, a reward must not replay on later home visits.

### 7. Reduced motion and accessibility

- Respect `prefers-reduced-motion: reduce`: create no flying travel or 3D rotation, immediately show the final displayed balance, consume pending state, and issue the completion announcement.
- Give the holder an accessible label in the form `Coin balance: N`.
- The accessible value must represent the true uncapped presented balance, even when the visible digits are capped at `9999`; after completion it must expose the true durable balance.
- Add a polite, atomic status announcement when reward presentation completes: `3 coins earned; balance N` for a normal win, generalized to the actual pending amount for a backlog. `N` is the true uncapped final balance.
- Do not announce each decorative flying coin separately.
- Avoid duplicate announcements during ordinary rerenders or idempotent finalization.

## Implementation constraints

- Maintain the existing model/view/controller separation: persistence and profile normalization belong in `player.js`; match orchestration belongs in the controller; markup/rendering/animation DOM work belongs in the view; styles remain scoped to `.game`.
- Account for the fact that constructor-time rendering currently occurs while home is already visible; pending presentation must start on initial load as well as after Continue returns from a result dialog.
- Reuse the current screen transition and Start game event paths instead of introducing a parallel navigation system.
- Preserve matchmaking, first-to-three scoring, result dialogs, winning-line animation, keyboard focus behavior, player statistics, and design-canvas scaling.
- Add no runtime dependencies.

## Acceptance criteria

1. A new or migrated player displays `0000`, and the persisted profile includes valid zero-valued coin and pending state.
2. Winning one or two `X` board rounds does not change the coin balance. The decisive third `X` round immediately persists `+3` balance and `+3` pending coins exactly once.
3. Drawn rounds, `O` round wins, and an overall `O` match win award no coins.
4. Continuing home after a local match win initially shows the pre-reward value, then three gold coins rotate around Y and follow independently eased X/Y paths into the holder; the amount increases once per arrival and ends 3 higher in about 1.4 seconds.
5. A reload/browser restart after the award but before consumption retains the durable balance and presents the pending reward on initial home load. After successful presentation, subsequent home entries do not replay it.
6. Visible values are always four digits and zero-padded through `9999`. A true balance above 9,999 remains uncapped in storage and accessibility output while visible digits remain `9999`.
7. A pending amount of 20 uses 20 icons. A pending amount greater than 20 still uses only 20 icons, applies the remainder on the last arrival, reaches the durable final amount, and remains near the standard total duration.
8. At/above the visible cap, newly earned coins still animate and pending state is consumed even though the visible digits cannot increase.
9. Activating Start game during animation finalizes and persists presentation exactly once, cleans up temporary elements, and proceeds to matchmaking without delay or later replay.
10. With reduced motion enabled, no travel/rotation runs; final balance, persistence, and one completion announcement update immediately.
11. The holder has `Coin balance: N`, completion announces the earned amount and true final balance once, decorative icons are hidden from assistive technology, and the plus icon is neither actionable nor focusable.
12. The holder is centered above the lowered home title, matches the existing visual style, and remains correctly positioned across supported viewport scales.
13. Automated tests cover profile creation/migration/normalization, award eligibility and once-only behavior, pending consumption, formatting/capping, normal and backlog presentation, interruption, reduced motion, accessibility, and initial-load replay. Existing tests continue to pass, `npm test` passes, and `npm run lint` passes.

## Out of scope

- Coin spending
- Store, purchase, or monetization behavior behind the plus icon
- A separate player profile/statistics UI
- Sounds or haptics
- Changing the fixed reward from 3 coins or the first-to-three match rules
