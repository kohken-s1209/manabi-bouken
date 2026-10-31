# Knowledge Village v5 — smartphone performance emergency fix
User feedback on v4 (after major visual improvement): "だいぶいい感じになったけど、超絶重すぎてヤバい😂笑". Preserve the excellent continuous forest/grassland look, expansion and buildings, but smartphone performance is now the top release-blocking priority.

## Confirmed source observations (storybook-demo/app.js at v4)
- requestAnimationFrame(frame) draws unconditionally for non-reduced-motion users: if (!reduced || dirty...) draw().
- Canvas DPR set to up to 2 and the entire game scene rerendered even idle.
- draw() reconstructs and depthSorts forest entities; depthSort contains O(n²) relationship building and O(n²) node-selection. This is a major potential bottleneck.
- drawLand creates numerous gradients, complex outlines and decorative details every frame.
- Weather, clouds, leaves, shadows and animations may cause unnecessary work.

## Requirements, strictly prioritized
1. Performance first: target smooth interaction on mainstream Android smartphones with steady frame pacing, no multi-second UI freezing. Preserve visual composition of v4; reduce decorative density only when essential.
2. **Do not rerun full static world every rAF frame.** Build layer-based cached raster canvas backgrounds/static layers and regenerate only when viewport resize, zoom/pan, land stage, or actual scene changes. Foreground building animation or effects separate, and pause when idle. Use dirty/event-driven draw; requestAnimationFrame only while animated, interacting or dirty. Avoid burning CPU when browser tab hidden; honor prefers-reduced-motion.
3. **Remove O(n²) depthSort on every frame**. Cache sorted entities per landscape change or replace with correct stable efficient painter order. Keep building overlaps/hit-tests logically correct.
4. Dynamic render resolution: on phones cap DPR to <=1.25 or <=1.5 as appropriate, or base on pixel budget; avoid large offscreen copies and excess memory. Maintain readable text and sharp-enough sprites.
5. Reduce garbage allocation, gradients, sprite creation during active frames; cache repeated sprite thumbnails and terrain work. Do not regenerate caches for mere animation tick.
6. Add a lightweight local performance diagnostics indicator behind opt-in query flag ?perf=1 (fps / draw ms / canvas size / cache rebuild count) so the user can compare. Keep hidden otherwise and never expose sensitive data.
7. Prevent the modal dialog text from turning vertical; keep the root modal fix and no overlap.
8. Keep existing stage counts 16/25/36/49/64, forest boundary retreats and ground-connected meadow, learning/resources, placements, building moves, grid only when editing. No changes whatsoever to main app or saved data.

## Mandatory self-checks
- Search for unconditional draw() in requestAnimationFrame and fix.
- Verify cached landscape invalidates on every terrain/building change and resize.
- Verify rendering/coordinate mapping remains correct.
- Node --check storybook-demo/app.js.
- Only edit storybook-demo/index.html, style.css, app.js and README.md.
- No dependencies, external network, images or third-party scripts. Preserve existing illustration quality as much as feasible.
