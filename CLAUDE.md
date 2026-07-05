# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

かんじのもり — a kanji learning game (karuta / two-player versus / word-building / collection book) for a 6-year-old, covering all 240 kanji of Japanese school grades 1–2. Built as an offline-capable PWA for iPhone/iPad (airplane use). All UI text is in kana-friendly Japanese for a child who cannot yet read many kanji.

## Development

Vanilla HTML/CSS/JS, no build step, no dependencies, no tests. Open `index.html` directly or serve statically (`python -m http.server`). Deployment target is GitHub Pages; offline support comes from `sw.js` (cache-first). **Bump the `CACHE` version string in `sw.js` whenever any asset changes**, or installed PWAs keep serving stale files.

## Architecture

- `js/data.js` — the single source of truth: `KANJI` (240 entries: `k` kanji, `g` grade, `w` word containing `k` exactly once, `y` word reading in hiragana, `e` emoji) and `WORDS2` (two-kanji words for ことばづくり, auto-derived from `KANJI` plus a manually curated `extra` list filtered to in-set kanji).
- `js/app.js` — all game logic. Screens are static `<section class="screen">` blocks in `index.html`, toggled via `showScreen()`. Each mode (karuta / versus / kotoba) keeps its state in a module-level object and re-renders its choices per round. Progress (stars per kanji, selected grade) persists in `localStorage` (`km_stars`, `km_grade`).
- Clue cards render the target kanji as a blank (`renderClue`), so distractor choices must never include any kanji visible in the clue word — `pickDistractors` enforces this.

## Data invariants (validate when editing data.js)

- Grade lists must match the official 学年別漢字配当表 (80 for grade 1, 160 for grade 2), no duplicates.
- Every `w` contains its `k` exactly once; every kanji appearing in any `w` or `WORDS2` word must itself be within grades 1–2.
- A validation script exists in scratchpad history; the checks are regex-parsing `data.js` (see git history of this file). PowerShell 5.1 scripts containing Japanese must be saved as UTF-8 **with BOM** or they mojibake.

## Notes

- Input handlers use `pointerdown` (not `click`) for fast response and fair two-player racing; keep it that way for anything tappable during play.
- No Node.js on this machine — validate with PowerShell, not node.
