# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

かんじのもり — a kanji learning game (karuta / two-player versus / word-building / collection book) for a 6-year-old, covering all 440 kanji of Japanese school grades 1–3. Built as an offline-capable PWA for iPhone/iPad (airplane use). All UI text is in kana-friendly Japanese for a child who cannot yet read many kanji.

## Development

Vanilla HTML/CSS/JS, no build step, no dependencies, no tests. Open `index.html` directly or serve statically (`python -m http.server`). Deployment target is GitHub Pages; offline support comes from `sw.js` (cache-first). **Bump the `CACHE` version string in `sw.js` whenever any asset changes** (and keep the `#app-ver` label in `index.html` in sync — it exists so users can see which version their device is running), or installed PWAs keep serving stale files. Pages deploys fail transiently now and then ("Deployment failed, try again later"); the fix is pushing an empty commit to trigger a fresh build.

## Architecture

- `js/data.js` — the single source of truth: `KANJI` (240 entries: `k` kanji, `g` grade, `w` word containing `k` exactly once, `y` word reading in hiragana, `e` emoji) and `WORDS2` (two-kanji words for ことばづくり, auto-derived from `KANJI` plus a manually curated `extra` list filtered to in-set kanji).
- `js/words.js` — `JUKUGO`: ~620 two-kanji words (all chars within grades 1–3) used only by the puzzle mode.
- `js/app.js` — logic for karuta / versus / kotoba / zukan. Screens are static `<section class="screen">` blocks in `index.html`, toggled via `showScreen()`. Each mode keeps its state in a module-level object and re-renders per round. Progress (stars per kanji, selected grade) persists in `localStorage` (`km_stars`, `km_grade`). Shared helpers (`$`, `shuffle`, `speak`, `showScreen`, `showResult`, `confetti`, `store`) are plain globals also used by puzzle.js (script order matters: data → words → app → puzzle).
- `js/puzzle.js` — かんじパズル: 2–4 player hot-seat Scrabble-like board game with two rule modes selected on the setup screen (persisted as `km_pzmode`): dict mode (app validates placements against the dictionary, legal cells highlighted) and free mode (place anywhere; a judge panel lists every sub-sequence of length ≥2 that contains the newly placed tile — not just whole runs — and humans mark each ⭕/❌; dictionary hits are pre-marked ⭕ with reading hints; already-placed sub-words are deliberately excluded to prevent double scoring). Balance constants in `PZ` were tuned by Monte Carlo simulation (see comment above `PZ`): the deck contains dictionary-participating kanji weighted by word count (cap 4 copies; free mode adds 1 copy of every remaining kanji), and initial board seeds are drawn from high-connectivity "hub" kanji placed non-adjacent. Do not switch deck/seeds to uniform-random over all 440 kanji — first-turn playability collapses from ~94% to ~34% in dict mode.
- Clue cards render the target kanji as a blank (`renderClue`), so distractor choices must never include any kanji visible in the clue word — `pickDistractors` enforces this.

## Data invariants (validate when editing data.js)

- Grade lists must match the official 学年別漢字配当表 (80 for grade 1, 160 for grade 2, 200 for grade 3), no duplicates.
- Every `w` contains its `k` exactly once; every kanji appearing in any `w` or `WORDS2` word must itself be within the included grades.
- Entries may share a reading `y` (火/日=ひ, 早い/速い=はやい…); `pickDistractors` excludes same-`y` kanji from choices so a round never has two correct answers. Keep `y` exact when adding entries.
- A validation script exists in scratchpad history; the checks are regex-parsing `data.js` (see git history of this file). PowerShell 5.1 scripts containing Japanese must be saved as UTF-8 **with BOM** or they mojibake.

## Notes

- Input handlers use `pointerdown` (not `click`) for fast response and fair two-player racing; keep it that way for anything tappable during play.
- No Node.js on this machine — validate with PowerShell, not node.
