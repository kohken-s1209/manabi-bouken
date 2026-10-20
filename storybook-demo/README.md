# Knowledge Village — storybook UI demo

Standalone, interactive mobile/tablet demo of the Knowledge Village town-building screen.
Open `index.html` in a browser (no build step, no server needed).

Files: `index.html`, `style.css`, `app.js` (plus this README). `IMPLEMENTATION_BRIEF.md` is the unchanged handoff brief.

## Safety / isolation
- No network requests, no external fonts/scripts/images, no secrets, no analytics.
- **No `localStorage`/`sessionStorage`/cookies are read or written.** It cannot see child progress or the main game's saved data. All state is in memory; reloading resets the demo.
- Study rewards are **simulated** — buttons just add currency in this page. Nothing is recorded anywhere.
- Nothing outside `storybook-demo/` was touched.

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
- **Normal view shows no grid.** The tile grid (semi-transparent, orange tint on occupied tiles) fades in only in 建てる / 建物を移動 modes.
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
