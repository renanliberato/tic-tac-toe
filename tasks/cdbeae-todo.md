# Fix leaderboard floating local-player row

## Context

The leaderboard screen has a floating local-player row (`#floating-local-row`) that appears when the real local row (`#leaderboard-local-row`) is outside the scrollable leaderboard list (`#leaderboard-list`). Two interaction/layout bugs need to be fixed:

1. The floating row currently crosses the list's bottom horizontal border because it is positioned too high. It has no opaque background, so the border shows through it awkwardly.
2. Activating the floating row currently calls `scrollIntoView()` on the real row. That may scroll the entire page or other scroll ancestors instead of only the leaderboard ranking list.

## Settled decisions and scope

- Move the floating row to `bottom: 16px`.
- Keep its current horizontal margins (`left: 80px`, `right: 80px`), dimensions, styling, and role as a button.
- Preserve the current UX of centering the real local row in the leaderboard list.
- Perform that movement by changing only `#leaderboard-list`'s scroll position; do not use `scrollIntoView()`.
- Use smooth list scrolling normally and instant/automatic scrolling when `prefers-reduced-motion: reduce` is active.
- Mouse/touch clicks and keyboard activation (Enter/Space, through the button's normal activation behavior) must use the same contained-scroll activation path.
- Focus the real local row after activation with `preventScroll: true`, so focus does not trigger an additional page scroll.
- The outer document/page scroll position must remain unchanged after activation.
- Keep the change limited to the leaderboard screen's existing floating local-player row. Do not change the ordinary in-list local row or other screens.

## Relevant current implementation

- `public/css/styles.css` contains `.game .leaderboard-floating`; it currently has `bottom: 72px`, `left: 80px`, `right: 80px`, and `min-height: 92px`.
- `public/index.html` defines `#leaderboard-list` followed by the button `#floating-local-row`.
- `public/js/view.js` stores both elements, attaches `handleFloatingActivation` to the floating button in `startLeaderboardLifecycle()`, and currently implements `jumpToLocalRow()` with:
  - `row.scrollIntoView({ block: "center", behavior: ... })`
  - `row.focus({ preventScroll: true })`
  - `updateFloatingLocalRow()`
- `public/js/view.js` already configures `#leaderboard-list` as the `IntersectionObserver` root and preserves its scroll position during refreshes.
- `tests/leaderboard-view.test.js` already has an activation test that stubs `scrollIntoView`, checks reduced-motion behavior, and checks focus; that test should be revised rather than creating a separate unrelated test suite.
- The project uses Vitest and jsdom. Run the focused leaderboard view tests, then the normal project test/lint commands as appropriate.

## Implementation requirements

1. Change only the leaderboard floating-row positioning needed to place its top clearly below the list's bottom border, using `bottom: 16px` while retaining the existing horizontal margins and row size.
2. Replace the `scrollIntoView()` path in `GameView.jumpToLocalRow()` with a calculation based on the leaderboard list and local row geometry/scroll metrics. Set `#leaderboard-list.scrollTop` (or use its scrolling API) to center the local row within that element's viewport.
3. Select the scroll behavior from `prefers-reduced-motion`: smooth for the normal case and automatic/instant for reduced motion. Do not invoke any API that scrolls page ancestors.
4. Retain `row.focus({ preventScroll: true })` and the existing floating-row visibility update.
5. Ensure activation remains correctly wired for pointer and keyboard button activation and does not leave duplicate listeners or alter lifecycle cleanup.
6. Add/update regression coverage in `tests/leaderboard-view.test.js` to verify:
   - the floating style uses `bottom: 16px`;
   - activation scrolls the leaderboard list to center the real local row;
   - the old `scrollIntoView` behavior is not used;
   - the outer document/page scroll position is unchanged after activation;
   - normal motion requests smooth scrolling and reduced motion requests instant/automatic scrolling;
   - the real local row receives focus without a focus-induced scroll.

## Acceptance criteria

- When the floating local-player button is visible, it is below the leaderboard list's bottom horizontal border with the agreed `bottom: 16px` offset and no border line visibly crossing the row.
- Clicking the floating button changes only the ranking list's scroll position and centers the real local row; the page/document and any outer scroll container do not move.
- Keyboard activation has the same contained-scroll behavior as pointer activation.
- Normal motion uses smooth scrolling; reduced-motion users get non-animated scrolling.
- The real local row remains focused after activation without causing an extra scroll.
- Existing leaderboard refresh, observer, lifecycle cleanup, navigation, and other-screen behavior remain intact.
- The focused leaderboard view tests and the project's applicable test/lint checks pass.
