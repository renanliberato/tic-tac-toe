# Add player profile and purchasable game-board styles

## Objective

Add a home-screen profile entry point, a read-only Profile screen, and a Styles screen where the local player can purchase, own, and equip one of nine persistent cosmetic color themes. An equipped theme changes the active game board and animated home board preview—including their cells, grid/border treatment, X/O SVG marks, and the active game winning line—without changing the rest of the app chrome.

## Relevant existing implementation

- This is a vanilla JavaScript single-page MVC app under `public/`, with no client-side router or icon library.
- `public/index.html` contains static Home and Game sections, inline X/O SVGs, the home coin holder, and the existing result dialog.
- `public/js/player.js` owns the local player record under `PLAYER_STORAGE_KEY` (`tic-tac-toe-player`). `getOrCreatePlayer`/`savePlayer` normalize all records, including records loaded from local storage. Current durable fields include the generated player ID/name, round statistics, `coin_balance`, `pending_coins`, and `last_move`.
- Statistics are round-based: `games_played`, `wins`, `draws`, and `losses` describe individual rounds, while a full best-of-three match win awards 3 coins.
- The home balance can temporarily present pending earned coins through a flying-coin animation. Existing Start-game behavior can finish/consume that presentation before navigating away.
- `public/js/view.js` coordinates DOM rendering and coin presentation; `public/js/controller.js` coordinates navigation/game behavior and player persistence; `public/js/model.js` is the board-game model.
- The UI uses Paper.css plus `public/css/styles.css`, is designed at a fixed portrait canvas and scaled to fit by the existing layout code.
- Existing board mark colors are Classic red for X and blue for O. Marks and the home preview use distinct inline X and O SVG shapes.
- Tests use Vitest/JSDOM and Cucumber/Puppeteer. Extend the existing relevant unit, MVC, layout/style, coin, and feature coverage rather than introducing a new framework.

## Functional requirements

### 1. Home profile entry point

- Replace the currently centered standalone home coin holder placement with a full-width top utility row.
- Keep the existing coin holder visual styling, balance behavior, formatting, and accessibility, but align it to the left of this row.
- Add an equal-height circular profile button at the right of the same row.
- The profile button appears on Home only, not during an active game.
- Use a conventional inline outline SVG depicting a head and shoulders. Do not add an icon dependency, photograph, initials, badge, or avatar editing.
- Give the button an accessible name such as `Open profile`.
- Keep the home title, animated board preview, and Start game button centered below the utility row.
- Clicking the profile button opens Profile. If earned coins are still being visually transferred into the holder, first finish that presentation immediately: remove flying coins, display and persist the full durable balance, clear `pending_coins`, and only then navigate. Profile/Styles must never show a temporarily understated or unspendable balance.

### 2. Screen navigation and focus

- Implement Profile and Styles as separate full-screen sections in the existing single-page app; do not add URL routing.
- Home is the root:
  - Profile’s top-left Back button returns Home.
  - Styles’ top-left Back button returns Profile.
- Each screen has a centered top heading (`Profile` or `Styles`) and an icon-plus-accessible-label Back button at top left.
- Only the active section is exposed. Hidden sections and their controls must not remain keyboard-focusable.
- On entering Profile or Styles, programmatically focus that destination screen’s heading (make headings focusable as needed without adding them to normal tab order).
- On Back, restore focus to the opener:
  - Styles → Profile: restore focus to the Profile screen’s Styles button.
  - Profile → Home: restore focus to the circular profile button.

### 3. Profile content

Display the existing local player's generated nickname prominently. Beneath it, show a compact two-column grid of labeled statistic cards for:

1. Games Played
2. Wins
3. Draws
4. Losses
5. Moves Played
6. Win Rate

Rules:

- Preserve the existing round-based meanings of all stored statistics.
- Win Rate is `wins / games_played`, rounded to the nearest whole percentage.
- Show `0%` when no rounds have been played.
- Do not expose the UUID, last move, pending coins, or other technical fields.
- Place a large, full-width `Styles` button below the statistic cards. It opens the Styles screen.

### 4. Persistent style catalog

Create a fixed catalog of exactly nine styles, in this display and progression order:

| Order | Style | Price | Palette direction |
|---:|---|---:|---|
| 1 | Classic | Free/default | Current paper, red X, blue O appearance |
| 2 | Forest | 9 | Cream, green, amber |
| 3 | Ocean | 19 | Pale blue, navy, cyan |
| 4 | Sunset | 29 | Peach, burgundy, orange |
| 5 | Lavender | 39 | Lilac, purple, pink |
| 6 | Mint | 49 | Mint, teal, coral |
| 7 | Midnight | 59 | Near-black, electric cyan, magenta |
| 8 | Desert | 69 | Sand, brown, turquoise |
| 9 | Neon | 89 | Deep violet, lime, hot pink |

- Classic must faithfully preserve the existing board/home-preview appearance.
- Define explicit reusable tokens for each style’s board/grid, cell surface/border, X, and O colors (and any necessary winning-line/background companion token).
- Exact color values are an implementation choice within the directions above, but tune them for legibility and clearly distinct themes. Board/cell boundaries and applicable controls/text must meet WCAG AA contrast expectations.
- Do not rely on color alone: retain distinct X/O SVG geometry, visible boundaries, focus indicators, and textual/icon state labels.
- A new player owns and equips Classic by default.
- Extend the existing normalized player record with durable owned-style and equipped-style data.
- Existing valid saved players that lack cosmetic fields must be backward-compatibly normalized to own and equip Classic, preserving all existing player identity, stats, balance, pending rewards, and last-move data.
- Validate/normalize malformed cosmetic data safely: Classic must remain owned, only catalog style identifiers may be owned/equipped, and an invalid or unowned equipped value must fall back to Classic.
- Purchases and equipped choice must survive reloads through the same player persistence mechanism as coins and statistics.

### 5. Styles screen layout and tile states

- Show a compact, read-only current coin balance near the Styles header using the same coin visual language as Home. It is contextual balance display, not global navigation chrome, and updates immediately after purchase.
- Render all nine styles as a 3×3 grid in the app’s portrait design while preserving usable responsive/scaled behavior.
- Every tile always shows:
  - Style name.
  - A full-color miniature 3×3 board preview that demonstrates that style’s grid, cells, X, and O colors.
  - A visible state/action treatment.
- Tile state treatment:
  - Locked and affordable: coin icon plus its price.
  - Locked and unaffordable: coin icon plus price and visible `Need N more` text, where `N = price - current balance`. Keep this message subdued but WCAG-AA legible.
  - Owned but not equipped: `Owned`.
  - Currently equipped: a prominent `Equipped` badge/check.
- Do not obscure or desaturate locked previews; players need to compare themes before purchase.
- Keep all locked styles clickable, including unaffordable ones.
- Make each entire tile one keyboard-operable accessible button. Its accessible name must include enough information to identify the style, state, and action (purchase/equip/currently equipped as applicable).
- Preserve clear keyboard focus indicators.

### 6. Purchase and equip behavior

- Clicking an affordable locked style immediately, atomically:
  1. Deducts its exact price from `coin_balance`.
  2. Adds it to the player’s owned styles.
  3. Equips it.
  4. Persists the complete result.
- There is no purchase confirmation dialog.
- Never permit a negative balance, duplicate deduction, ownership of unknown styles, or a partially persisted purchase.
- Clicking an owned, unequipped style equips it for free and persists the choice.
- Clicking the currently equipped style is a harmless no-op.
- Do not show a purchase/equip success modal. Immediately update the Styles balance, all ownership/equipped/affordability labels, tile state, and applied theme without moving focus.
- Include a polite live region and announce:
  - `Purchased and equipped [Style]` after a successful purchase.
  - `Equipped [Style]` after switching to an owned style.

### 7. Insufficient-coins modal

When an unaffordable locked style is activated:

- Make no change to balance, ownership, or equipped style.
- Open an informational modal titled `Not enough coins`.
- Show `You need N more coins to unlock [Style]`, using the exact shortfall.
- Provide one `OK` button.
- Allow dismissal by OK, Escape, and backdrop click because this is informational, unlike the app’s blocking final-match result dialog.
- Manage modal semantics and focus accessibly: focus an appropriate modal control on open, contain interaction while open, and return focus to the attempted style tile after dismissal.

### 8. Theme application scope

Apply the equipped style immediately and on every later app load to:

- The active game board outer border/grid treatment.
- Active game cell surfaces and borders.
- Active game X and O SVG marks.
- Winning cells as appropriate to those theme tokens.
- The winning line, using the winning mark’s X or O theme color rather than hard-coded Classic red/blue.
- The animated 3×3 home preview’s board/grid, cells, and X/O SVG marks.

Do **not** theme general application chrome. Keep page/background defaults, headings, profile content, navigation buttons, player cards, coin displays, Styles chrome, and dialogs on the existing Paper.css/application styling, except for each style tile’s intentional miniature preview. Theme changes made on Styles should be visible in the style state immediately and remain applied when the player returns Home or starts a game.

## Accessibility and interaction constraints

- Use semantic buttons/headings/sections and useful accessible names; decorative SVGs must be hidden from assistive technology.
- Preserve visible focus states and full keyboard access for profile navigation, Back controls, style tiles, and modal dismissal.
- State and affordability must be conveyed by text/icons, not color alone.
- Use polite live announcements for successful purchase/equip changes without stealing focus.
- Respect existing reduced-motion handling where present; new state transitions must not require animation to be understood.
- Avoid regressions to the result dialog’s intentionally non-dismissible backdrop/Escape behavior.

## Testing expectations

Add or update automated tests to cover at least:

### Player persistence/unit behavior

- New player owns/equips Classic.
- A legacy stored player without style fields migrates to Classic while retaining all prior data.
- Malformed/unknown ownership and equipped values normalize safely.
- Affordable purchase deducts the exact amount once, owns and equips the style, and persists across reload.
- Owned style switching is free; clicking the equipped style is a no-op.
- An unaffordable purchase makes no state changes.
- Prices/catalog order are exactly Classic/free, then 9, 19, 29, 39, 49, 59, 69, 89.

### UI/MVC behavior

- Home utility row exposes the existing balance on the left and Home-only accessible profile button on the right.
- Opening Profile during pending coin presentation finalizes the full balance and clears pending coins before navigation.
- Profile renders nickname, all six agreed statistics, correct rounded win rate, and 0% for no games.
- Profile and Styles navigation hides inactive sections and follows entry/return focus rules.
- Styles renders nine tiles in a 3×3 grid with full previews and correct locked/shortfall/Owned/Equipped states.
- Successful purchase and owned-style equip update balance/state/theme immediately, persist, do not move tile focus, and emit the correct live announcement.
- Unaffordable activation opens the specified modal with exact shortfall; OK, Escape, and backdrop dismiss it and restore tile focus.
- The existing final result dialog remains protected from Escape/backdrop dismissal.
- Equipped palette tokens affect the home preview, active board/cells/X/O marks, and winner-colored winning line, while ordinary app chrome remains unchanged.
- Classic retains the current visual theme.
- Existing gameplay, statistics, coin reward/presentation, viewport scaling, and accessibility-label tests continue to pass.

Run the repository’s normal validation commands (`npm test` and `npm run lint`) after implementation.

## Acceptance criteria

1. Home shows the existing coin balance at top left and a circular accessible person-outline profile button at top right, with no profile button during gameplay.
2. Profile and Styles are navigable full-screen SPA sections with the agreed headers, Back hierarchy, hidden-screen behavior, and deterministic keyboard focus restoration.
3. Profile accurately displays nickname, five stored counts, and rounded round win rate in the agreed card layout.
4. Nine named, visibly distinct, accessible style previews appear in a 3×3 grid with exact progressive pricing and unambiguous lock/ownership/equipped/shortfall states.
5. Classic is safely default-owned/equipped for new and legacy players; ownership and equipped state persist in the normalized local player record.
6. Affordable locked styles purchase and equip instantly without confirmation; owned styles equip free; current style is a no-op; all successful changes update UI/theme and announce accessibly.
7. Insufficient funds never mutate player data and show the exact informational modal, dismissible by OK/Escape/backdrop with focus returned to the attempted tile.
8. The selected theme affects only the requested game board, cells, X/O marks, winner line, home board preview, and style mini-previews; ordinary app chrome remains unchanged.
9. Existing game, reward, persistence, dialog, accessibility, responsive scaling, lint, and automated test behavior remains green.
