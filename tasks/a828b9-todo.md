# Remove the TIC TAC TOE title from the home screen

## Objective
Remove the visible `TIC TAC TOE` heading from the home screen while preserving the app’s identity elsewhere and all other home-screen functionality.

## Confirmed scope and decisions
- Remove only the visible home-screen heading `#home-title`.
- Preserve the browser document title and the global page `h1`.
- Keep the home preview, widgets, and Start game control.
- Let the remaining home content reflow naturally; do not leave an empty title slot.
- Replace the home section’s `aria-labelledby="home-title"` relationship with `aria-label="Home"` so `#home-screen` remains an identifiable accessible landmark.
- Remove obsolete title-specific view behavior rather than retaining a no-op compatibility path.
- Keep and update regression coverage and the focused diagnostic script so they assert the intentional absence of `#home-title` and its non-recreation.
- Remove obsolete home-title CSS while leaving other home layout, spacing, preview, widget, and control styling unchanged.

## Relevant repository facts
- `public/index.html` currently defines `#home-screen` with `aria-labelledby="home-title"` and contains `<h2 id="home-title">TIC TAC TOE</h2>`.
- `public/js/view.js` currently queries/stores `#home-title` and has logic that recreates it; controller calls and affected tests must be updated when that API is removed.
- `public/css/styles.css` contains a `.game #home-screen h2` rule that becomes obsolete.
- `tests/home-title.test.js` currently tests the old presence/recreation behavior and should be retained as a focused regression suite rewritten to assert absence/non-recreation.
- `tests/styles.test.js` currently asserts the obsolete home-screen `h2` font-size rule; rewrite that assertion to ensure no home-title styling remains while retaining other layout assertions.
- `scripts/reproduce-home-title.mjs` currently treats the title’s absence as a failure; invert it to succeed only when `#home-title` is absent and `#home-screen` has `aria-label="Home"`.

## Implementation requirements
1. Remove the home title element from the home-screen markup.
2. Set `aria-label="Home"` on `#home-screen` and remove the stale `aria-labelledby` reference.
3. Remove `GameView` title querying, state, recreation method, and any controller calls or related compatibility behavior.
4. Remove only the obsolete home-title CSS rule; preserve the remaining home layout and visual behavior.
5. Update the focused unit tests and diagnostic script to encode the new contract.
6. Update any affected fixtures/mocks only as needed for the removed view API; do not alter unrelated features.

## Acceptance criteria
- `#home-title` does not exist in the rendered home screen.
- The browser document title, global page `h1`, preview, widgets, and Start game control remain unchanged and functional.
- `#home-screen` has `aria-label="Home"` and no stale `aria-labelledby="home-title"` reference.
- Home content reflows naturally without an empty title-specific slot.
- View/controller code cannot recreate the removed heading.
- No `.game #home-screen h2` title rule remains, while unrelated home layout/style rules remain intact.
- The rewritten home-title tests and diagnostic script pass, along with the relevant existing test suite.
