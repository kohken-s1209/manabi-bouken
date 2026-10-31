# Knowledge Village v7 — gentle animated river ONLY, retain v6 speed

Owner acceptance: v6 operates smoothly on Android; forest clearing and cross-river bridge work. One observed defect: water appears completely frozen. Make river visibly flow again, WITHOUT sacrificing v6's successful mobile performance.

Constraints:
- Preserve v6 performance architecture, scenery, buildings, learning, modal, map and cross-river functionality. Do NOT regenerate or re-render static ground/trees every animation frame.
- The river/waterfall is currently baked into cached ground (drawWater(P), static layer, T=0), causing static water. Implement a **cheap, independent transparent moving-water highlight layer** along the existing river path: small shimmer streaks/ripples moving downstream, optional waterfall trickle/pool ripple; do not repaint vegetation, land, waterfall cliff or river for each frame.
- Cache river geometry/path masks and positions per viewport/stage. Draw only a bounded small number (e.g. 8–24) of short highlights with at most a few lightweight Canvas strokes/composites; or use one prerendered overlay bitmap translated under a cached water-path clip. Avoid large offscreen buffers and per-frame gradients.
- The animation should be clearly noticeable when observed ~3 seconds but subtle enough for beautiful storybook water. Flow direction must be correct; move along sampled river centreline, not random horizontal movement. Cross-river bridge should render above the water animation where they overlap and not drift.
- 15–24fps (or lower) is fine for river animation; rest of UI must remain responsive with idle rendering capped. When tab hidden / prefers-reduced-motion / low-power mode, pause motion and render one static frame.
- Ensure interactions (study, building, expanding) don't invalidate the forest cache just because water animates. No extra dependencies or network use.
- Keep no further scope creep, no changes in aesthetic/layout outside water. Only edit storybook-demo/index.html, style.css, app.js, README.md. Main application and saves untouched.
- Add ?perf=1 river tick/draw timing if useful. Verify node --check. Note actual device smoothness requires owner's confirmation.
