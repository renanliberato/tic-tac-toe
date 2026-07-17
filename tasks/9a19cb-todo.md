# Implement the recurring seven-day Daily Gifts feature

## User story

As a player, I can claim one daily gift on eligible app-open days, see my progress in a seven-day calendar, and receive the coins through the existing home-screen balance celebration.

## Repository context

This is a vanilla JavaScript MVC game using static markup and CSS:

- `public/js/player.js` owns the locally persisted player profile under `tic-tac-toe-player`, normalization/migration, the in-memory fallback, `awardCoins`, and `consumePendingCoins`.
- `public/js/controller.js` loads the player and starts the home presentation in its constructor. It coordinates home/game transitions and match reward awards.
- `public/js/view.js` owns DOM/dialog behavior and the existing home coin presentation. That presentation is reduced-motion aware, counts the displayed header balance up to the durable balance, and renders at most 20 decorative flying coins.
- `public/index.html` contains the home screen, coin header, and native `<dialog>` elements.
- `public/css/styles.css` uses the PaperCSS/hand-drawn visual language and scales a fixed `1125 x 2436` design canvas via `--page-scale`.
- Tests use Vitest/jsdom and Cucumber. Extend the relevant player, controller/view, CSS/layout, and feature coverage rather than relying only on manual verification.

## Functional requirements

### Reward schedule and progression

Implement a recurring seven-step reward cycle:

| Cycle day | Reward |
| --- | ---: |
| Day 1 | 10 coins |
| Day 2 | 10 coins |
| Day 3 | 10 coins |
| Day 4 | 10 coins |
| Day 5 | 10 coins |
| Day 6 | 10 coins |
| Day 7 | 100 coins |

Use eligible login days, not elapsed-calendar-day positions:

1. A new player is eligible for Day 1 on the local calendar date when the profile is created.
2. An existing valid profile with no daily-gift state is migrated on its first open after this feature ships and is eligible for Day 1 immediately. Preserve all existing identity, statistics, balance, and pending match coins.
3. Eligibility is evaluated once during page startup. The first startup on a strictly later local calendar date may advance the cycle by **at most one step**. Refreshing/reopening on the same local date does not advance it.
4. Missing dates do not skip or forfeit rewards. For example, if Day 1 is claimed Monday and the next startup is Thursday, Thursday offers Day 2.
5. An offered reward remains unclaimed and available across later startups until claimed. Claiming, rather than merely opening or dismissing the modal, completes the current step.
6. A successful claim does not make the next step claimable on the same date. The next step becomes eligible on the first startup whose local date is strictly later than the relevant prior eligible-login date.
7. After Day 7 is claimed, the next eligible startup on a strictly later local date resets the visible cycle and offers Day 1 again. Thus each cycle has seven claims and repeats indefinitely.
8. Crossing midnight while the page remains open, returning from gameplay to home, or refocusing an existing tab does not reevaluate eligibility and does not count as a login. A reload/reopen is required.
9. Compare stable local calendar-date values, not elapsed milliseconds. An observed equal or earlier local date (clock rollback or timezone travel) cannot advance or replay a reward. A later local date advances only one step even if multiple dates were crossed.

Persist sufficient normalized gift state with the player to enforce this state machine across reloads. Keep date/time acquisition injectable or otherwise deterministic enough to unit test all date transitions.

### Persistence, migration, and currency integrity

- Award coins and mark the gift claimed as one logical operation, persisting the durable coin balance immediately before presentation. Reload/navigation must not lose an earned award.
- Re-read the latest persisted profile/gift state immediately before a claim. A profile/date/cycle-step reward must be grantable only once, including when multiple tabs are open.
- Keep open tabs synchronized where practical (for example, via the browser `storage` event): update gift progress and the displayed durable balance when another tab writes newer state.
- If a stale modal attempts a reward already claimed in another tab, grant and animate nothing. Refresh to the persisted claimed state, close the modal, and show the synchronized balance without an error alert.
- Normalize missing, malformed, or internally inconsistent gift fields on an otherwise valid player to fresh Day 1 eligibility for that startup. Do not reset the player ID/name, statistics, coin balance, valid pending match coins, or other valid profile data.
- Preserve the existing storage resilience policy. If local storage is inaccessible or a write fails, keep daily gifts functional with in-memory state for the running page, prevent repeat claims in that session, and do not block gameplay. It is acceptable that this fallback cannot survive a full reload.
- Ensure all existing player mutation paths preserve the new gift fields; normalization/save operations must not silently discard them.

### Home-screen launcher

Add a square Daily Gifts button on the left-center edge of the home screen/design canvas:

- It is available only while the home screen is active, not during matchmaking, gameplay, or result UI.
- Use an inline calendar SVG (no new external asset dependency).
- Give it an accessible name such as `Daily gifts`.
- Keep it visible within supported scaled viewport sizes and consistent with the existing PaperCSS/hand-drawn styling.
- Do not add an availability badge, continuous pulse, or other persistent attention animation.
- Activating it opens the daily gift modal in either claimable or read-only mode as appropriate.

### Daily Gifts modal and calendar

Add an accessible modal dialog titled **“Daily Gifts”** with a three-row grid:

- Row 1: Day 1, Day 2, Day 3.
- Row 2: Day 4, Day 5, Day 6.
- Row 3: one Day 7 cell spanning all three columns.
- Every cell shows its `Day N` label, a coin symbol/icon, and its amount (`10` or `100`).
- Claimed cells have a green border and a visible check overlay.
- The currently claimable, unclaimed cell has a clearly highlighted border.
- Future cells use the ordinary/default treatment.
- Match the current PaperCSS/hand-drawn visual language and the scaled native-dialog layout.

On initial page startup, automatically open the modal once if the current gift is unclaimed. Do not auto-open it again when returning home in that page session; the launcher remains the manual entry point.

#### Claimable mode

- Supporting copy: **“Tap anywhere to claim today's reward”**.
- Include a visible, keyboard-focusable **Claim** button as an accessible equivalent and focus an appropriate explicit action when the dialog opens.
- Any pointer click/tap inside the dialog content claims the reward, whether on a cell, text/background, or the Claim button.
- A backdrop click dismisses without claiming.
- Escape dismisses without claiming and restores focus to the launcher or the control that opened the dialog.
- Guard the claim path during and after activation so event bubbling, rapid input, stale state, or repeated activation cannot award twice.

#### Read-only mode

When the startup's reward has already been claimed, opening from the launcher shows progress with:

- Supporting copy: **“Come back tomorrow for your next gift.”**
- A visible, keyboard-focusable **Close** button, focused when opened.
- Any click/tap inside the dialog, a backdrop click, Escape, or the Close button closes without changing state or presenting another award.
- Restore focus to the launcher/previous opener after closing.

Implement reliable native-dialog backdrop detection so a click inside the dialog is not mistaken for a backdrop click. Preserve standard dialog semantics and accessible title/description relationships.

### Claim and coin animation sequence

On a valid claim:

1. Persist the claimed state and full durable award immediately and disable repeat activation.
2. Animate a check appearing in the current cell for about 300–400 ms.
3. Close the modal.
4. Present the coins through the existing home-screen flying-coin/count-up treatment and update the header to the full durable balance.

Reuse the existing coin presentation behavior rather than introducing a distinct daily-gift animation:

- Days 1–6 display 10 decorative coins.
- Day 7 displays at most 20 decorative coins; the remaining value is applied on the final arrival, and the balance reaches the full +100 award.
- Keep the existing accessible balance label and earned-coins live announcement accurate.
- Under `prefers-reduced-motion: reduce`, show the claimed state and close without transitional motion, then use the existing immediate/reduced-motion coin path so the full balance is applied without flying/check motion.

Reward presentations must never overlap or discard coins:

- At startup, if unpresented match-win coins already exist and the gift is unclaimed, show the daily modal first.
- If the player claims at that point, combine the gift and existing pending coins into the existing single pending-coin presentation after the modal closes.
- If the player dismisses without claiming, immediately present the pending match coins; a later gift claim gets its own presentation.
- If a match-coin presentation is already running when a gift is claimed manually, let it finish, then run the daily-gift presentation as a separate queued presentation. Do not interrupt, merge, or overlap those two in-session presentations.
- Both awards are persisted immediately even while their visual presentations are queued. Starting gameplay or navigating/reloading must not lose durable currency.

## Suggested implementation boundaries

The precise gift-state field names and helper API are implementation choices, but keep responsibilities aligned with the existing code:

- Put reward constants, gift-state normalization/date progression, latest-state validation, and atomic claim/coin mutation in the persistence/domain layer (`player.js` or a focused module used by it).
- Let the controller evaluate startup once, order modal versus pending coin presentation, queue presentations, react to claims/dismissal, and handle storage synchronization.
- Let the view own launcher/dialog event binding, calendar rendering, classes, focus restoration, backdrop/Escape behavior, and check/coin animation completion callbacks.
- Extend the existing pending-coin mechanism as needed so combined startup rewards and separate in-session queued rewards both obey the behavior above.

Do not introduce authentication or a backend; “account creation” means creation/migration of the locally persisted player profile in this repository.

## Acceptance criteria

1. A fresh profile sees a claimable Day 1 modal on its creation-date startup; claiming adds exactly 10 durable coins and the same date cannot yield another gift.
2. Existing profiles migrate to Day 1 without losing any valid profile data, existing balance, or pending match coins.
3. The sequence is 10 coins for Days 1–6 and 100 for Day 7; only one next step is unlocked per strictly later local-date startup, skipped dates do not skip rewards, and unclaimed rewards remain available.
4. After claiming Day 7, the next startup on a later local date presents a reset Day 1 cycle. Same/earlier local dates and midnight in an already-running page do not advance it.
5. The home-only calendar launcher uses an accessible inline SVG, remains visible in the scaled layout, opens the modal, and has no badge/pulse.
6. The modal renders the required 3/3/1 spanning grid, labels and values, claimed green/check states, highlighted current state, and ordinary future states.
7. Claimable-mode inside clicks and the Claim button claim once; backdrop and Escape dismiss without claiming. Read-only mode closes from inside, backdrop, Escape, or its focused Close button. Focus is restored appropriately.
8. A valid claim visibly checks the cell, closes, and runs the existing balance animation; reduced motion removes transitional animation and applies the final balance immediately.
9. Existing startup pending coins are combined after a claim or presented immediately after dismissal. A gift claimed during an active coin animation is queued separately and starts only after the current presentation finishes.
10. Duplicate activation and stale/multiple-tab claims never duplicate currency. A stale tab closes quietly in synchronized claimed state and shows the latest balance.
11. Malformed gift-only state resets only that state, and unavailable/failing storage falls back to duplicate-safe in-memory behavior for the session.
12. Existing gameplay, player statistics, match rewards, dialog behavior, page scaling, and coin formatting/announcements continue to pass their tests.
13. Automated tests cover at minimum: profile creation/migration/normalization; all local-date progression and reset cases; persisted and in-memory duplicate prevention; reward amounts; multi-tab stale claims/storage updates; modal rendering and all pointer/keyboard close/claim paths; focus restoration; reduced motion; startup ordering; combined versus queued coin presentations; and the launcher’s home-only/scaled layout.
14. `npm test` and `npm run lint` pass.
