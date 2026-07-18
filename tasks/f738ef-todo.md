# Juice up the battle-pass screen with a milestone rail, reward VFX, and ambient motion

## Goal

Make the monthly battle-pass screen feel like an energetic neon arcade reward showcase rather than a plain list. Use the existing tic-tac-toe X/O identity, bright progress accents, layered glows, playful motion, and satisfying localized feedback. The screen must remain useful and alive even when the player has no reward currently available to claim.

## Repository context

- This is a dependency-free browser app using plain HTML, CSS, and ES modules under `public/`.
- `public/index.html` contains `#battle-pass-screen`, its header/back button, the existing exact `N / 100 points` summary, reset text, `#battle-pass-list`, and the polite live `#battle-pass-announcement` status.
- `public/js/view.js` owns screen transitions and `renderBattlePass()`. It currently renders all 100 milestones as native `<button type="button">` elements with `data-battle-pass-milestone`, state classes, accessible labels, and four text children: level, requirement, reward, and action. `showBattlePass()` renders then focuses the heading.
- `public/js/controller.js` already wires battle-pass open/back/claim behavior, rerenders after claims, and preserves the existing live claim wording and home focus behavior.
- `public/js/battle-pass.js` defines `BATTLE_PASS_MILESTONE_COUNT = 100`, one point per milestone, reward values, monthly-cycle normalization, and the existing claim rules. `public/js/player.js` persists normalized pass points and claims with the player profile.
- `public/css/styles.css` contains the existing `.game .battle-pass-*` styles. The screen uses the app's fixed design canvas and is currently a vertically scrolling list of roughly 96px cards.
- There are no reward-image assets; rewards are currently text-only. The enlarged reward visual must therefore be CSS/SVG and must not require an asset pipeline or runtime dependency.
- Existing automated coverage uses Vitest/jsdom (`tests/battle-pass.test.js` and related view/controller tests), Cucumber, and ESLint. `AGENTS.md` says to prefer Paper.css defaults and scope necessary custom styles beneath `.game`.

## Settled visual direction

- Use an energetic neon arcade treatment grounded in the existing X/O game identity.
- Make each milestone card substantially taller: target roughly 120–150px on desktop, fluid on narrow screens, with the full 100-milestone list remaining vertically scrollable.
- Keep cards readable and reward-focused. Add a prominent CSS/SVG gold coin token beside the existing `+N gold` label; do not invent image assets.
- Available/current rewards get the strongest settled visual treatment. Locked rewards remain visible as future goals with a quiet/faint treatment, and claimed rewards settle visually.
- Add a handful of slowly drifting, low-contrast X and O symbols behind the content, with a very faint grid and two soft gradient glows for depth. Keep all ambient effects behind text and controls and never let them compete with reward content.
- Add continuous low-intensity ambient motion, a short screen entrance, and a restrained stagger only for initially visible cards. Do not stagger all 100 cards.
- Use lively hover/focus lift while preserving a clear keyboard focus indicator.
- A newly reached or claimed milestone gets only a localized short celebration: card pulse, bright rail-node flare, and about 6–10 small neon/gold particles spreading and fading in roughly 600ms. Do not use a large full-screen celebration.
- Play the stronger burst only after a reward is newly reached or claimed during the current interaction. Reopening the screen shows the settled glow/current marker but must not replay a celebration.
- The idle state should still feel alive when nothing is claimable: use a restrained shimmer/float on the current or available reward, much quieter locked-reward treatment, and static claimed rewards.

## Functional and layout requirements

### 1. Summary and no-claimable state

Extend the existing summary without removing its exact text or reset date:

- Keep `N / 100 points` prominent and authoritative.
- Add a visible sentence such as `X points to milestone Y` beneath it, where Y is the next target. If the player has reached milestones that remain unclaimed, Y is the lowest-numbered unclaimed reached milestone; otherwise Y is the first locked milestone above the current points.
- Add a compact horizontal neon progress bar with an adjacent integer percentage. The percentage is the points value because there are 100 milestones. Do not replace the exact counter with percentage-only UI.
- When points are below 100 and no reward is currently claimable, include a quiet integrated “keep playing” status line and persistent glow/halo on the next locked milestone and its rail marker. Do not add a blocking/prominent banner.
- At 100/100, replace the next-goal copy with a clear `Season complete` treatment, retain `100 / 100 points` and the reset date, and leave milestone claimed/available semantics unchanged.
- Expose the new next-goal/completion copy as ordinary visible text. Do not rely on color, animation, or decorative nodes for communicating state.

### 2. Vertical progress rail

Make one vertical progress rail the visual spine of the list:

- Place it on the left side of the milestone cards in the same scrolling content area; it must scroll with the cards rather than remain sticky.
- Align one compact circular node to every milestone card.
- Use a thin neon base rail and a brighter filled segment representing current progress from the rail origin through the current points, clamped to 100. At 0 points the fill starts at the rail origin; at 100/100 it reaches the final node and the whole rail glows.
- Use a distinct pulsing diamond/halo marker for the current target (the lowest-numbered unclaimed reached milestone, then the first locked milestone; no target at completion). Keep the target visually distinct from the ordinary circular nodes.
- Preserve alignment as cards become taller and as the list scrolls. Make the rail/card arrangement responsive without horizontal scrolling.
- Use decorative rail layers with `aria-hidden="true"` or equivalent presentational treatment. The summary text and native milestone controls remain the semantic state communication.

### 3. Milestone cards and reward token

Update `renderBattlePass()` and its styles while preserving the existing button behavior:

- Keep all 100 `data-battle-pass-milestone` native buttons. Reached unclaimed rewards remain enabled and claimable; locked and claimed rewards remain disabled exactly as before.
- Keep the existing accessible labels and claim action wording, including the controller's live claim announcement.
- Give each card fluid height with a desktop target of approximately 120–150px. On narrow screens keep the rail at the left and stack card fields into a usable vertical layout; do not introduce horizontal scrolling.
- Add a large decorative CSS/SVG gold coin token as the reward visual, while retaining a readable `+N gold` label. The token must be `aria-hidden`/presentational and must not duplicate the reward announcement.
- Add state classes/data hooks as needed for current target, available, claimed, locked, and event VFX, but do not alter player rules or persistence.
- Make available/current cards glow clearly; keep locked cards visible but subdued; keep claimed cards settled. Ensure reward text and action controls remain legible over all effects.

### 4. Opening, scrolling, and interaction motion

- When opening the screen, automatically scroll the list to center the next actionable/target milestone when one exists. At zero progress, leave milestone 1 visible. The target is the lowest-numbered unclaimed reached milestone; once those are all claimed, target the first locked milestone. Do not change the existing list order or rules.
- Use a short screen fade/slide entrance and a restrained stagger only for cards initially visible in the viewport. Avoid animating all 100 cards or delaying access to the list.
- Add hover/focus lift and clear focus styling without breaking keyboard navigation.
- Ensure idle ambient movement remains low intensity and does not distract from controls.

### 5. Milestone event VFX

- On a newly reached milestone or successful claim during the current interaction, trigger a localized approximately 600ms effect around that card and its rail node: card pulse, node flare, and 6–10 small neon/gold particles that spread and fade.
- The effect must be non-blocking, must not obscure the list, and must not replay solely because the screen was reopened or rerendered from settled state.
- Coordinate with the existing controller/view rerender path so a successful claim can identify the claimed milestone without changing claim semantics. Keep the live status announcement as the accessible feedback.
- Clean up temporary particle elements/classes after the effect and avoid accumulating DOM nodes during repeated claims.

### 6. Reduced motion and accessibility

- Respect `prefers-reduced-motion: reduce`: disable drifting X/O movement, entrance/stagger motion, looping token motion, rail pulsing, hover transition motion, and particle travel/bursts. Preserve static glows, progress fill, target/complete styling, and all textual state cues.
- Preserve native buttons, keyboard focus, back navigation, existing `aria-label`s, and the polite atomic `#battle-pass-announcement` live region.
- Mark ambient X/O layers, grid/glow layers, coin tokens, rail decoration, progress-bar decoration, and particles `aria-hidden` or otherwise presentational. Do not create duplicate screen-reader announcements.
- The current target, points-to-go, and season-complete states must be understandable from visible text/state, not only from color or animation.
- Maintain sufficient contrast for reward text, summary text, labels, buttons, and focus outlines in every card state.

## Implementation constraints

- Keep the existing 100-milestone rules, reward values, monthly reset behavior, claim behavior, persistence, navigation, and controller/view separation unchanged.
- Keep `battle-pass.js` and `player.js` as the sources of truth for pass state and claims. Presentation calculations may live in the view or a small presentation helper, but do not duplicate or modify reward rules.
- Keep markup changes in `public/index.html` limited to stable containers needed for summary/ambient layers/rail; generate repeated milestone decorations in `renderBattlePass()` as appropriate.
- Keep custom CSS scoped beneath `.game`; prefer existing Paper.css defaults where possible. Use CSS/SVG rather than adding assets or dependencies.
- Do not alter unrelated screens, coins, player statistics, game flow, or storage schema.
- Keep all 100 cards in the existing scrollable list. The rail must scroll with the list and must not become a sticky header/sidebar.
- Preserve the current back-button focus return to `#open-battle-pass` and heading focus when entering the screen.

## Acceptance criteria

1. The battle-pass screen visibly has an energetic neon arcade/X/O treatment, ambient low-contrast moving Xs and Os, faint grid/glows, and a short entrance treatment while the content remains readable.
2. All 100 milestone buttons still render with their existing `data-battle-pass-milestone` hooks, native disabled/enabled behavior, accessible labels, claim behavior, persistence, and live announcement wording.
3. Cards are substantially taller (approximately 120–150px on desktop, fluid on narrow screens), remain vertically scrollable, and have no horizontal scrolling on narrow screens.
4. Every card has a prominent decorative CSS/SVG gold coin token plus a readable existing-style `+N gold` label; decorative tokens do not create duplicate assistive-technology output.
5. A left-side rail scrolls with the cards, has one aligned circular node per milestone, fills through the current points, highlights the current target with a diamond/halo, and fully illuminates at 100/100.
6. The summary retains exact `N / 100 points` and the reset date, adds an integer percentage plus a compact horizontal bar, and shows `X points to milestone Y` for the next target.
7. With no claimable reward, the screen clearly communicates the next milestone, points remaining, and a quiet keep-playing state; the next locked card and rail marker stay persistently emphasized. At 100/100 it instead communicates `Season complete`.
8. The target selection is deterministic: lowest-numbered unclaimed reached milestone first, then first locked milestone; the list opens centered on that target, except zero progress opens with milestone 1 visible. No target or celebratory replay appears for a completed/reopened settled state.
9. Available/current rewards have restrained idle shimmer/float, locked rewards are much quieter, and claimed rewards are static. Hover/focus adds a lively but accessible lift.
10. A newly reached or successfully claimed milestone produces only a localized card pulse, rail-node flare, and approximately 6–10 particles that finish within about 600ms; temporary VFX is cleaned up and does not accumulate.
11. Reduced-motion users receive no ambient movement, entrance/stagger motion, looping token motion, rail pulsing, or particle travel, while all static state cues, text, focus, and functionality remain available.
12. Decorative layers are hidden from assistive technology, while the existing native buttons, visible summary/target/completion text, keyboard navigation, focus return, and polite live claim status remain intact.
13. Tests cover the 100-card structure, taller/responsive markup hooks, rail nodes/fill/current-target selection, summary text and completion state, opening auto-scroll target, token/decorative accessibility, claim-triggered VFX cleanup, no replay on reopen, reduced-motion styling/hooks, and preservation of existing claim/navigation semantics. Existing tests continue to pass, `npm test` passes, and `npm run lint` passes.

## Out of scope

- Changing the 100-milestone count, points awarded, reward values, monthly reset, claim eligibility, claim persistence, or navigation behavior.
- Adding reward image assets, a new asset pipeline, runtime dependencies, sounds, haptics, or full-screen celebration/modal effects.
- Changing unrelated screens, player profile fields, coin economy, game rules, or controller flow beyond the minimal presentation/event hook needed to trigger localized VFX.
