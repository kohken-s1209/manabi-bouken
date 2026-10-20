# Knowledge Village — storybook UI demo

Standalone, interactive mobile/tablet demo of the Knowledge Village town-building screen.
Open `index.html` in a browser (no build step, no server needed).

Files: `index.html`, `style.css`, `app.js` (plus this README). `IMPLEMENTATION_BRIEF.md` is the unchanged handoff brief.

## Safety / isolation
- No network requests, no external fonts/scripts/images, no secrets, no analytics.
- **No `localStorage`/`sessionStorage`/cookies are read or written.** It cannot see child progress or the main game's saved data. All state is in memory; reloading resets the demo.
- Study rewards are **simulated** — buttons just add currency in this page. Nothing is recorded anywhere.
- Nothing outside `storybook-demo/` was touched.

## Visual status — read this honestly
- **The approved reference screenshot was not available as a file, so this build has NOT been compared against it.** It is an interpretation of the brief's written direction (warm illustrative fantasy, layered trees, waterfall + stream, grassy land, red-roof cottage, cream HUD, bottom buttons). Do not treat it as a faithful reproduction.
- **Not visually verified by the author of this change:** the sandbox did not allow running a browser or Node, so the code was reviewed by reading only. Expect to need visual tuning (building proportions, tree density, stream placement) after a first look on a real device.

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
- **Move (建物を移動):** tap a building, tap a destination, confirm. Invalid destinations are shown red and blocked; the building is never lost. Undo toast.
- **Store (建物をしまう):** tap a building → confirmation dialog → stored (not destroyed) with undo.
- **Selection:** in the normal view, tapping a building highlights it and shows 移動 / しまう chips.
- **Expand (土地を拡張):** 4×4 → 8×8 for 開拓点 20/35/50/70; existing buildings stay put, the camera re-fits, and the new ring is previewed in gold.
- **Simulated rewards (学ぶ FAB):** 算数 → 🪵+12, 国語 → 📚+3 🪵+2, 英語 → 🌍+2 🪵+2, each +10 開拓点. Studying each of 算数/国語/英語 twice unlocks the multi-subject buildings (図書館, 天文台, 国際カフェ, 貿易商店, 交流ホール).
- Layout fills the viewport (`100dvh`, safe-area insets), canvas scales with devicePixelRatio, 44px+ touch targets, `prefers-reduced-motion` respected. Escape returns to the normal view.

## Known limits
- On a narrow phone the full 8×8 plot is small (~30px tiles); the view auto-zooms to fit the current land size but there is no manual pan/zoom.
- Buildings are tapped via an approximate hull around their footprint + height, so tall roofs can overlap tiles behind them.
- `window.KVDemo` exposes in-memory state/helpers for automated checks only.

## Suggested next steps
1. Look at it on an Android phone (≈360px) and tablet (≥768px) and tune art proportions.
2. Compare against the approved reference once it is committed or attached to issue #1, and only then claim a visual match.
3. Swap placeholder emoji and procedural buildings for authored, license-clean assets if higher fidelity is needed.
