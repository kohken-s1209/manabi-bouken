# Knowledge Village v9 — Japanese Grade 2 curriculum-aligned math and multiplication

## Owner-approved learning philosophy
- Child currently in grade 2, math textbook publisher 大日本図書, 新版たのしい算数.
- Learning should lead school's current material by ~2–4 weeks, not accelerate blindly. Exact classroom pace is unknown and MUST NOT be invented. Give parent simple manual current-topic / advance-level setting, default late-October grade-2 introductory multiplication; allow adjustment without wiping progress.
- **Rewards strongly based on correctness**: incorrect/challenge alone earns ZERO gameplay resources and ZERO development points. Fully correct first-try no-hint 100%; correct with hint reduced; correct on retry reduced. Don't penalize the child emotionally. Prevent exploiting repeats or refresh. Never reward incorrectly answered tasks.
- Strong emphasis on real math word problems and choosing addition vs subtraction, alongside multiplication.

## Deliverables
1. Add a proper multiplication learning track to the existing 2nd-grade math problems, in stages:
   (a) equal groups via illustrated baskets/objects, repeated addition;
   (b) multiplication symbol and representation, matching expression to story;
   (c) times tables (2 and 5 as introductory sets, then 3,4,6,7,8,9,1 as mastery permits);
   (d) practical multiplication word problems in fantasy village contexts.
   All multiplication examples mathematically accurate. At least 30 meaningful templates / generators across stages; avoid confusing order of multiplicand and multiplier. No out-of-grade content by default.
2. Add a small parent-gated/parent-facing learning settings section: current school unit (addition/subtraction word problems, multiplication introduction, 2/5 times tables, other tables, multiplication word problems), default 'multiplication introduction'; next-up preview ~2–4 weeks ahead as a rough suggestion, not an asserted schedule. Manually set school unit; persist only in demo namespaced localStorage; can choose ahead or reinforcement.
3. **Mastery model**: progress per operation/topic (add vs subtract word problems, groups, expression, each times-table), based on independent correct answers, no-hint first tries, hints, errors, spacing/review. Use lightweight rule-based stage unlocking and prioritize weak topics + spaced reviews. Keep previous v8 learning history; migrate safely; do not falsely transfer counts to a topic or reset village. For every topic show concise progress bars to parent; children see only next approachable task, simple subject choices.
4. Question selection: mix current-level (~60%), weak/review (~30%), ahead (~10%) as bounded model only if prerequisites okay. Never lock the child out or create impossible prerequisites. For 2nd grade use safe, child-readable Japanese and large multiple-choice or simple number answer. Visually show equal groups in a lightweight DOM way, not canvas heavy animation. Questions must have unique choices, correct answer & accurate explanations; use at least several tests/self-check routines covering multiplication, distractors and reward-once guards.
5. **Rewards**: continue v8 verified correctness economy for wood/books/globe and land points. Full credit for correct solo answers, partial for hint/retry; incorrect only gives guidance, no points. Harder independently solved tasks may earn modest extra. Once-only per generated question ID; account for repeats. Do not break building unlocks.
6. Maintain v8 responsive mobile performance (v6 raster/cached forest). No added heavyweight assets, network, external dependencies, moving river graphics changes or new frame loops. Existing village, bridge, buildings, mobile panels, local saves must remain intact. All study interactions should be DOM-based, without forcing ground rerenders.
7. Keep Japanese/English question systems unchanged except to maintain correct reward/progress migration. Scoped ONLY to storybook-demo/index.html, style.css, app.js, README.md. No changes to main app, workflow, secrets or shared saves. Test node --check, inspect question correctness, data migration, parent settings, reward guard, mobile layout; document changes and limitations.

Reference curriculum: 大日本図書の令和6年版『新版 たのしい算数』2年; authoritative publisher materials https://www.dainippon-tosho.co.jp/introduction2024/sansu/index.html . **No reproduction of textbook exercise text or diagrams; write original problems.**
