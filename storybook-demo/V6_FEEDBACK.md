# Knowledge Village v6 — CRITICAL mobile performance and river-crossing reclamation

## Actual owner feedback 2026-10-31
"あかん！まだ超絶重い😂😂😂 村の開拓具合は森方面は良いかも👍 ただ川は越えてかないね"
v5 was STILL extremely slow on Android despite caching attempts. v5 screenshots show attractive forest retreat; preserve this ART DIRECTION. The open land does not expand across the river; user wants the village to be capable of expanding to/over the river rather than only away from it.

## Performance is a release blocker — PRIORITY 1
Source diagnosis from v5:
- draw() rebuilds complex entire Canvas scene in live animation mode.
- frame() schedules animations, with cached static still doing costly forest composites and callbacks.
- depthSort(list) uses quadratic graph and quadratic selection; repeated when camera/expansion moving.
- Dense hundreds of detailed trees and shrubs, high-resolution sprite/gradient drawing. Even if frames throttled, an individual expensive frame freezes taps.
- Canvas DPR and offscreen memory may be large.
NO MORE incremental throttling alone: redesign fast path.

Requirements:
1. Build **pre-rendered forest / ground / decoration as raster layers**, only regenerate when stage or viewport changes; composite at modest DPR. Pre-render repeated trees using a sprite atlas, reuse. **NEVER call detailed tree drawing for hundreds of trees during interaction or animation frames.**
2. Simplify foreground plant density on phone selectively but keep picture rich (use background raster trees instead of a thousand live vector trees). Prioritize LOW END Android; draw at 1x resolution if necessary with appropriate CSS scaling. Implement battery/performance quality setting or default mobile fast mode.
3. Eliminate dynamic O(N^2) depth sorting: cache/reuse pre-computed order, or render trees to static layers with limited building sprites in sortable foreground. Avoid expensive canvas reallocations.
4. For normal taps/learning/build menu, **do not invalidate background caches** unless terrain actually changed; avoid costly rebuild per UI event.
5. Expansion animation: composite cheap precached *before* and *after* scene images with fade/scale, not redraw all forests every animation frame. Use maximum few image draw calls.
6. Stop animation when idle and when document hidden. Avoid animating hundreds of clouds/particles with separate functions.
7. Add **visible-on-demand** ?perf=1 overlay with actual render frame duration, fps and cache rebuild count; support mobile. For benchmarks frame CPU should target <16ms ideal or at least <33ms worst case on midrange Android, and clicks should respond without freezing. Cannot assert physical device success without actual test.
8. Run code syntax check and inspect memory/canvas sizes. If still not feasible, use a single static composite per stage and drop ambient animation/FX on mobile. PERFORMANCE IS MORE IMPORTANT THAN DECORATIVE MOTION.

## River and expansion — PRIORITY 2
Screenshots show clearing grows mainly into trees, not across the stream. Terrain should be a continuous reachable world, not a rectangular or isolated land platform. Design the progression to **expand toward and then across the river** (ideally a footbridge as a later-stage unlock), with an obvious newly cleared grassy area on the opposite bank. Keep the beautiful water as a scenic feature; do not silently cover water with grass or allow buildings placed in river.
- Revisit world coordinate/grid vs river curve geometry. At later sizes 49/64, visibly open terrain across water where feasible. Enable an obvious crossing/bridge and playable cells on either side, ensuring map positions, hit testing and placement restrictions are consistent.
- If the existing 16/25/36/49/64 logical tile grid cannot support a proper river crossing without destabilizing save data, use an opt-in experimental visual crossing within this standalone demo, and clearly label restrictions. Do NOT pretend the feature works if no cross-river buildable tiles exist.
- Keep natural meadow blending, no floating island. Maintain previous village/building positions after expansion.
- Fix any modal stacking bugs if seen. Preserve all learning/study, resources, button, edit grid modes.

## Scope
Only storybook-demo/index.html, style.css, app.js, README.md.
Leave main application, all persisted data, GitHub workflow/secrets untouched. Offline self-contained app. Add a concise change log in README describing actual implemented optimizations and cross-river behavior (honest if partial).
