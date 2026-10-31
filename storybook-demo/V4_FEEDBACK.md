# Knowledge Village v4 — actual forest reclamation and modal bug fix

## Primary user feedback
Screenshots of v3 at 16,49,64 tiles reveal only a few decorative trees vanish: land is a floating green tabletop, surrounding forest hardly moves, so there is NO compelling clearing experience. Confirm dialog text still wraps one Japanese character per line in an oversized central oval.

## Must-do changes
1. **Transform terrain presentation**. Replace the floating hard-edged square/isometric plateau with a natural continuous grassy clearing visually integrated into surrounding forest. Keep invisible logical tile grid for gameplay; drawing does NOT need to expose square edges. Reconcile touch coordinate mapping to any changed visual terrain.
2. **Expansion changes real visible forest boundary, not just foliage count.** Derive clearing boundary from unlocked grid radius, and redraw foreground/midground forest/tree-line with a visibly larger open meadow. At 16 tiles: small clearing, dense trees close to boundary. At 25/36/49/64: each expansion moves treeline OUTWARD; substantial new grass visible in place of trees. Do not let scenery conceal playable tiles. Preserve decorative distant mountains and river unless needed for layout. Land growth must be obvious in adjacent screenshots even with UI hidden.
3. **Show clearing animation** after purchasing an expansion: nearby boundary vegetation fades/shrinks/dissolves or swings away, ground becomes brighter, sparkles/dust subtle. All motion reduced or skipped for prefers-reduced-motion. Ensure hit testing and player interactions still work.
4. **Fix modal at root**: current UI has narrow Japanese glyph columns inside huge dialog. Inspect DOM/CSS/layout and resolve widths/min-width/absolute overlays/shrink behavior. On mobile width 360px, text should render horizontally across >= ~200px, not vertically as one character per line. Modal fully within viewport and not overlapped by building shop/other dialogs; show only ONE active dialog. Buttons usable. Test two distinct cases: invalid placement explanation, valid building confirmation.
5. Retain long-press selection, footprint collisions, resource HUD, buttons and rich illustrations. No editing of main game, original save data or other paths.

## Implementation constraints
- Only edit storybook-demo/index.html, storybook-demo/style.css, storybook-demo/app.js, storybook-demo/README.md.
- Do NOT modify workflow files, original game, accounts, secrets or dependencies.
- Offline self-contained demo, no network use. No unrelated files.

## Concrete QA checks
- Compare v4 screenshots at 16, 25, 36, 49, 64: visually greater meadow and smaller/retreated nearby woodland; no unchanging foreground walls of trees.
- 360x800 and 390x850 mobile: valid/invalid build confirmation dialog text wraps naturally in Japanese, minimum readable content width. No stacked one-character columns.
- Non-overlap tests, long-press, tile mapping after growth, building move, cancel, resource values stable.
- Use a bounded implementation plan before editing; don't waste 140 turns changing unrelated components.
