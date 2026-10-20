# Knowledge Village v2 — user-approved changes (2026-10-20)

## Acceptance tests, ordered
1. **No visual building collisions.** Enforce logical footprint intersection and prevent actual illustrated building sprites/roofs from visibly overlapping after placement and movement. If rendered footprint extends beyond logical tile, account for it in collision/hitboxes or arrange occlusion intentionally. Invalid preview clearly red; placement blocked; no resource consumed.
2. **Long press move.** In ordinary browse mode, press a building for ~450–600ms to select it, highlight the selection, then tap any valid destination to move. Short tap does NOT initiate an unintended move. Provide visible Cancel, pointer-cancel/touch-scroll support, and invalid-position feedback.
3. **Clear editable land.** Remove oversized foreground trees that cover buildable tiles. Concentrate scenery trees/flowers/rocks around perimeter; playable middle and front stay visually accessible and tap targets unobstructed.
4. **Improve visuals.** User explicitly judged existing Canvas illustration as simplistic; they want much richer illustrated storybook fairytale appearance (luminous grass, stream and waterfall, warm flowers, wooden fences, red-roof cottage, soft detailed lighting/shadows). Preserve current consistent angle and grounding; they're accepted. Enhance visual density and sophistication without busying playable area. Reference image is in ChatGPT conversation, NOT present in repository; do not claim reference fidelity based on unseen image.

## Preserve
- Existing top resource HUD, charming buttons and mobile layout (user likes it).
- No permanent grid: reveal only during placement/move.
- Math/Japanese/English simulation, no real child learner data.
- Separate demonstration state from main game's localStorage/save keys.
- No changes outside storybook-demo/index.html, style.css, app.js, README.md.

## Manual tests
- Place two houses on adjacent tiles; absolutely no visible roof/body overlap.
- Try placing over another building: fail clearly without losing materials.
- Press briefly: should not move; long press: enters move mode; valid destination commits, invalid blocked, cancellation returns to browse.
- Test touch viewport 360-420px and tablet viewport 768px; controls usable, front buildable space not hidden by trees.
- Deliver a self-contained candidate for visual review, not automatically publish to main.
