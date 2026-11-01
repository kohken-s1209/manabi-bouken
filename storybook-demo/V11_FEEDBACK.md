# Knowledge Village v11 — 積極的な漢字表記＋未習漢字の正確なルビ

## Owner's verified feedback
v10 works, but too many everyday words remain in hiragana. The user specifically requests that less familiar kanji such as 枚 appear as kanji **with furigana**. Keep natural reading flow, with no harder words unnecessarily avoided solely because they are not yet taught.

## Priority acceptance
1. Rephrase original math, Japanese and relevant quiz narratives into natural age-appropriate Japanese using everyday kanji, including 小鳥, 折り紙, 枚, 持つ, 公園, 何枚, 全部, 教室, 図書館, etc. Add **word-level, verified correct ruby** to any unlearned words/characters. Do not naïvely change every hiragana string or replace grammatical particles with kanji. Respect appropriate elementary-school orthography.
2. For questions involving counters, fix v10's explicit omission ("counter kanji straight after a numeral never annotated"): provide vetted reading for the COUNTER ITSELF, e.g. 14<ruby>枚<rt>まい</rt></ruby>, 6<ruby>枚<rt>まい</rt></ruby>, but avoid incorrect numeral+counter total readings (一人=ひとり, 二日=ふつか). Explicitly test numbers 1,2,3,6,14 plus 人, 枚, 個, 本, 冊; use safe numeral-independent counter furigana only where pronunciation is invariant, and verified full-phrase readings or simpler rewriting otherwise.
3. Ensure roman/English, mathematical expressions, numbers and dynamic template substitutions remain correct. Preserve full automatic problem generation and answer logic from v9, same rewards and difficulty settings. Validate all question sets (addition/subtraction, groups, tables, word problems); syntax check.
4. Allow parent to set recognized kanji via v10 reading level settings. Known kanji no ruby, unlearned ruby. If parent toggles ruby off, do not render visually unreadable unfamiliar glyphs without either a clear warning or a readable fallback; avoid surprising data resets.
5. **Keep question layout compact and natural** on 360–390px phones; ruby text must not create huge unnecessary line breaks, and answer controls remain large, visible, not overlapped. Add QA examples before/after to README.
6. No new canvas heavy rendering, no changes to river, forest/bridge, 3-subject economics, performance architecture. Do NOT change original app or existing saves; only storybook-demo/index.html, style.css, app.js, README.md. Preserve namespaced v8/v10 learning/reading saved settings and migrate additively.
7. Include in README explicit distinction between kanji allocations by grade and exact classroom progression; don't invent the latter. Maintain offline, no network.
