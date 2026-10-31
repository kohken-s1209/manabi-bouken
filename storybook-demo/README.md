# Knowledge Village — storybook UI demo

Standalone, interactive mobile/tablet demo of the Knowledge Village town-building screen.
Open `index.html` in a browser (no build step, no server needed).

Files: `index.html`, `style.css`, `app.js` (plus this README). `IMPLEMENTATION_BRIEF.md` is the unchanged handoff brief.

## Safety / isolation
- No network requests, no external fonts/scripts/images, no secrets, no analytics.
- **No `localStorage`/`sessionStorage`/cookies are read or written.** It cannot see child progress or the main game's saved data. All state is in memory; reloading resets the demo.
- Study rewards are **simulated** — buttons just add currency in this page. Nothing is recorded anywhere.
- Nothing outside `storybook-demo/` was touched.

## v4 changes (from `V4_FEEDBACK.md`)
**Verification status — read first:** this change was written and re-read by hand only. The sandbox did not allow running Node or Chromium (both required approval that was not granted), so `node --check`, a headless run, screenshots and the 360×800 / 390×850 dialog checks were **not** done. Nothing below has been observed running. Run the QA list in `V4_FEEDBACK.md` in a real browser before relying on it; expect tuning (pads, tree density, camera fit).

1. **Terrain.** The floating earth slab, its earth bank and the square fences are gone. The ground is one continuous grassy clearing with a soft, organic outline (feathered edge, canopy shade, leafy lip, tufts and flowers across the whole meadow). The logical tile grid is unchanged, so tap→tile mapping, collisions and the build/move grid overlay behave as before; the grid is still drawn in 建てる / 建物を移動 modes. The stream, waterfall, road, hills and far cottages are kept (the meadow is painted first so the stream and road cross it).
2. **Expansion moves the treeline.** `clearRadius()` derives the clearing outline from the unlocked land size: a rounded square hugging the plot plus a margin (0.8 / 1.4 / 2.1 / 2.9 / 3.8 tiles for 16 / 25 / 36 / 49 / 64) with a gentle wobble. Trees may only stand beyond that outline, so the visible tree line *is* the meadow boundary and moves outward each time; bushes and rocks may hug the edge, flowers live inside. Trees the outline swallows leave **stumps** behind. The camera no longer fits the plot to a constant 70% of the width: it fits the whole clearing to a share of the width that grows with the land (34% → 62%), so early on a ring of forest is visible beside the plot and later the meadow runs off the screen. The painted far forest is darker forest floor behind the brighter clearing. Tall trees still never stand in front of the plot and never touch the plot outline.
3. **Clearing animation.** After 拡張する: cleared trees sway, shrink and dissolve with leaf puffs and sparkles; the meadow outline eases outward with the camera; a soft wave of light runs out through the new ground (no tile squares are flashed any more) and a light bloom brightens it. Under `prefers-reduced-motion` the sway and twinkles are skipped and the effect shortens to a quick fade.
4. **Dialogs.** The modal overlay is now `position:fixed` + grid, and the dialog has an explicit `inline-size` (`min(100vw − 24px, 360px)`) with a minimum, `writing-mode:horizontal-tb` on every text node, and a max height so it cannot exceed the viewport. The placement bar and toast text have a ≥ 200px line length (buttons drop to their own row when they do not fit beside it). Opening the 「しまう？」 dialog closes the shop sheet, placement bar, hint, toast and chips, and toasts are suppressed while it is open; showing the placement bar hides the toast. **Not verified in a browser** — I could not reproduce the original vertical-text screenshot, so the exact original cause is unconfirmed; this is a defensive fix of every sizing path I could find by reading the CSS. The invalid-placement explanation and the valid-build confirmation both live in the placement bar (the same element, two states).
5. **Foreground.** Foreground plants are low, live only in side strips that narrow from 15% to 5% of each side as land grows, thin out, and never enter the centre or the plot outline.
6. **Kept:** long-press lift → tap destination → cancel (「やめる」/Escape/tapping the same spot), projected-footprint + bounding-box + silhouette collision, depth ordering, HUD, buttons, isometric angle, shadows. Art is still original procedural drawing; **no claim is made that it matches any supplied raster screenshot.**

## v3 changes (from `V3_FEEDBACK.md`)
**Verification status — read first:** this change was written and re-read by hand only. The sandbox required approval to run Node, so `node --check`, a headless run and a real-browser pass were **not** done. Nothing below (including the 360px check and the 16/25/36/49/64 stages) has been observed running; do that pass before relying on it.

1. **Message window.** The vertical, one-character-per-line text came from centred overlays (`left:50%` + `translateX(-50%)`) being shrink-wrapped to *half* the screen width. The hint, placement bar, toast and chips now use `width:max-content` / `fit-content` with a `max-width`; the placement bar and toast are centred with `left`/`right` + `margin:auto`. `writing-mode:horizontal-tb`, `line-break:strict` and `overflow-wrap` are set explicitly. The confirm dialog is `min(100%,340px)` wide, scrolls instead of overflowing, and its buttons wrap inside it. The toast is positioned above the placement bar (`--toast-b`), chips are clamped clear of the bottom bar, and opening the 「しまう？」 dialog hides the toast and chips, so the build menu, popup and dialog no longer stack. Long messages were shortened.
2. **Land expansion = clearing the forest.** The forest is a fixed set of world-space trees / bushes / rocks (`WR0..WR1`, well past 8×8). Each object has a clearing distance from the plot edge that grows with every expansion (trees ≈0.9 → 2.6 tiles, bushes ≈0.35 → 1.6), so the ring around the plot empties and the edge withdraws: 16 → 25 → 36 → 49 → 64 tiles. The painted backdrop forest is rebuilt per stage (front rows removed first, rest climbs toward the horizon, side trees thin out and move outward) and cross-fades. The lawn halo widens and a dirt road gets wider. In 土地を拡張, trees that the next step will clear glow gold.
3. **Expansion feel.** New tiles flash and fade outward from the centre with twinkles and a light bloom; cleared trees shrink and fade with leaf puffs; the camera eases out. Reduced-motion users get a short fade only.
4. **Placement / overlap.** `visualConflict` now checks, in a scale-free projection: projected tile-footprint diamonds, then painted bounding boxes (broad phase), then the exact painted silhouettes (SAT). Draw order is a topological sort by footprint rectangles (wholly-left / wholly-behind), with x+y only as a tie-break — replacing the plain x+y sort, which is wrong for large buildings beside small ones. Moves use the same check (the mover ignores only itself).
5. **Long-press move.** Unchanged flow (hold 500 ms → tap destination), plus pointer capture, cancel by tapping the building's own spot, 「やめる」, Escape, mode buttons, or hiding the tab.
6. **Foreground.** Foreground plants live only in the outer 15% of each side, are capped in size, avoid the plot outline, and thin out as land grows; the centre stays clear. Trees/bushes are drawn from cached bitmaps to keep the denser forest cheap.
7. **Art.** More forest depth and a road/clearing; still original procedural drawing. **No claim is made that it matches any supplied raster screenshot** — none is in the repo and no comparison was done.

No storage, network or external assets were added; saved data and the main game are untouched.

## v2 changes (from `V2_FEEDBACK.md`)
1. **No visual building collisions.** Placement is refused when the *painted* shapes touch, not only when logical tiles do. Each building has a screen-space silhouette (convex hull of walls, roof overhang, ridge, chimney/cupola/mast/flags, doorstep and props) computed in a scale-free projection; two silhouettes must not overlap (separating-axis test) in addition to the tile-footprint test. The same silhouette is used for tap hit-testing. Roofs and props were pulled back inside their own tile so side-by-side buildings are possible; draw order is depth-sorted. An invalid preview is drawn red (footprint, outline, the blocking building) with a shake and a reason in the action bar; the OK button stays disabled, so no resource is spent and nothing moves. Trade-off: because tall roofs project upward on screen, two houses on tiles that are directly adjacent along the "front/back" axis are refused; they fit side by side along the diagonal or with a gap.
2. **Long-press move.** In browse mode, press a building for 500 ms (a progress ring fills) to lift it, then tap any valid tile to move it (undo toast offered). A short tap only selects. A visible 「やめる」 button (and Escape) cancels; drifting more than 10 px, releasing early, a second finger, `pointercancel` (browser scroll/gesture takeover), blur, scroll or tab switch cancel the pending press. Invalid targets show red feedback and a reason and keep the building lifted.
3. **Clear editable land.** Scenery is only drawn when its painted bounding box does not touch the plot outline; trees stand behind/beside the plot only, the front uses low bushes/rocks/flowers, and foreground dressing is limited to the two bottom corners. Side framing trees are sized from the screen width so they do not climb onto the plot on a phone.
4. **Richer illustration** (all procedural Canvas, no assets): layered, shaded and blossom/fruit-dotted trees, flowering bushes, faceted mossy rocks, petalled flowers, hazy far cottages, luminous meadow with bokeh and warm flowers, dappled lawn light with a leafy lip, pointed-picket wooden fences with post caps and shadows, stream lily pads/cattails/glints, a faint rainbow in the waterfall mist, and buildings with clapboard, stone joints, timber corners, shutters, curtains and warm window glow, shingled roofs, gable timbers, doorstep and wreath.

## Visual status — read this honestly
- **The reference image lives in a ChatGPT conversation and is not in this repository, so this build has NOT been compared against it and makes no claim of matching it.** It is an interpretation of the written direction (warm storybook fantasy, luminous grass, stream and waterfall, warm flowers, wooden fences, red-roof cottage, cream HUD, bottom buttons).
- **Not run or visually verified by the author of this change:** the sandbox did not allow executing a browser or Node, so everything above was reviewed by reading only. Expect to need a first look and tuning on a real device (silhouette tightness, scenery density, art proportions) — in particular the collision rule has not been exercised in a browser.

### Actual art vs placeholders
| Element | Kind |
|---|---|
| Sky, clouds, hills, meadow, layered forest, trees/bushes/rocks, waterfall, stream, fence, lawn plot, all 8 buildings (incl. red-roof cottage), build-tray thumbnails, logo crest, button icons | **Original procedural art** drawn in code (Canvas 2D / inline SVG). Stylised, not hand-painted illustration quality. |
| HUD currency icons 🪵 📚 🌍 and 🧮 📖 🔤 on study cards | **Placeholders** (system emoji; look differs per OS). Replace with authored icons later. |
| Fonts | System font stack only (no web fonts), so the title does not have custom lettering. |
| Building art | Simplified isometric primitives; not high-resolution painted assets. |

## What works
- **Normal view shows no grid** (the grid is logical; the ground is a continuous meadow). The tile grid (semi-transparent, orange tint on occupied tiles) fades in only in 建てる / 建物を移動 modes.
- **Build (建てる FAB):** pick a building in the tray, tap a tile to preview (green = OK, red = blocked), then OK (or tap the ghost again). Correct footprint, collision against land edge and other buildings, currency deducted, undo toast. Buildings put away earlier appear in the tray as "しまってある ×n" and are placed for free.
- **Move (建物を移動 button):** tap a building, tap a destination, confirm. Invalid destinations are shown red and blocked; the building is never lost. Undo toast. (Long-press in browse mode is the faster path, see above.)
- **Store (建物をしまう):** tap a building → confirmation dialog → stored (not destroyed) with undo.
- **Selection:** in the normal view, tapping a building highlights it and shows 移動 / しまう chips; pressing and holding lifts it for a move.
- **Expand (土地を拡張):** 4×4 → 8×8 for 開拓点 20/35/50/70; existing buildings stay put, the camera re-fits, and the new ring is previewed in gold.
- **Simulated rewards (学ぶ FAB):** 算数 → 🪵+12, 国語 → 📚+3 🪵+2, 英語 → 🌍+2 🪵+2, each +10 開拓点. Studying each of 算数/国語/英語 twice unlocks the multi-subject buildings (図書館, 天文台, 国際カフェ, 貿易商店, 交流ホール).
- Layout fills the viewport (`100dvh`, safe-area insets), canvas scales with devicePixelRatio, 44px+ touch targets, `prefers-reduced-motion` respected. Escape returns to the normal view.

## Known limits
- On a narrow phone the full 8×8 plot is small (~30px tiles); the view auto-zooms to fit the current land size but there is no manual pan/zoom.
- Buildings are tapped via their painted silhouette (convex hull, slightly conservative around chimneys/flags), which is also what keeps them from visually overlapping; this makes some adjacent-tile placements impossible by design.
- `window.KVDemo` exposes in-memory state/helpers for automated checks only.

## Suggested next steps
1. Look at it on an Android phone (≈360px) and tablet (≥768px) and tune art proportions.
2. Compare against the approved reference once it is committed or attached to issue #1, and only then claim a visual match.
3. Swap placeholder emoji and procedural buildings for authored, license-clean assets if higher fidelity is needed.
