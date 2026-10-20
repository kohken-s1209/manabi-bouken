# Knowledge Village — Storybook UI implementation handoff

Related issue: https://github.com/kohken-s1209/manabi-bouken/issues/1

## Goal
Reproduce the user-approved mobile storybook game screen *visually*, then make the actual buttons and buildings interactive. The previous prototype-v08/ layout was mechanically functional but visually unacceptable: a tiny cottage on flat diamonds inside a large unstyled white dashboard. This is NOT acceptable as visual completion.

## Safety and delivery
- Work in feature/knowledge-village-storybook-ui; propose changes via a Draft PR.
- New isolated page: storybook-demo/index.html plus scoped CSS/JS and assets.
- Never alter main/index.html, existing child progress, existing game localStorage keys, Supabase, or production service settings.
- Keep generated visuals user-owned and license-clean; don't scrape third-party proprietary game graphics.

## Visual direction (authoritative reference must be supplied to Claude)
- Highly polished Japanese storybook-fantasy illustration: leafy forest, warm grassy terrain, streams and waterfall, wooden fences, tiny flowers, storybook red-roofed cottage.
- Tall mobile screen, actual game screen fills viewport and shows scenery behind HUD.
- Header logo with Japanese title ナレッジビレッジ and subtitle 知識で育てる、あなただけの街.
- Rounded creamy off-white HUD badges showing 土地16マス/開拓点0, 🪵 28, 📚 0, 🌍 0.
- Bottom large rounded buttons: 土地を拡張, 建物を移動, 建物をしまう, in an unobtrusive anchored row.
- Buildings have coherent isometric angle, high-res asset, and grounded contact/cast shadow to upper left. No harsh grey oval below a floating tiny raster.
- Grid NOT VISIBLE in ordinary exploration. Only visible while placing or moving a building, with semitransparent overlay and occupancy highlight.
- UI must be readable at 360px wide and tablet 768px+; controls are real HTML buttons.

## Interaction acceptance
- Build mode: choose a building, see available tiles, tap free tile to place; correct footprint and currency deduction.
- Move mode: tap existing building, then destination tile; invalid destination blocked without destroying building.
- Store mode: confirm or explicitly present safe undo, no accidental storage on mere incidental scroll.
- Expand land using points.
- Simulated math / Japanese / English study buttons only; no real records touched.
- Basic functional tests and screenshot review with reference image required before claiming close visual match.

## Visual delivery blocker
Approved target UI screenshot currently exists in the ChatGPT conversation, not necessarily in this repository. Ensure it is attached to issue #1 or committed as an owned reference asset before Claude tries visual implementation. Until then, do not claim faithful reproduction.

## Automation integration
The independent kohken-ai-poc repository proved a narrow Issue→Claude Code→isolated checks→Draft PR workflow. Its hard-coded allowlists/triggers do not work automatically here. Do not reuse credentials, alter secret permissions, add self-executing issue triggers, or assume any CLAUDE_CODE_OAUTH_TOKEN exists in manabi-bouken.
Before enabling a Claude workflow, require verified credentials for this repository, bounded workflow permissions, repo-specific triggers, and owner approval of the setup. No auto-merge or main push.
