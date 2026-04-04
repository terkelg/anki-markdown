# agents.md

Guidance for coding agents working in this repository.

## Scope

This project is an Anki add-on that creates the `Anki Markdown` note type, stores note content in `Front` and `Back` fields, renders those fields as markdown during review, and adds Shiki-based syntax highlighting for code.

## Documentation Split

- `readme.md` — project overview, installation, development, release
- `docs.md` — end-user syntax, settings, customization, AI-agent usage
- `docs/editor-markdown-highlighting-spec.md` — editor highlighting notes
- `skills/anki/SKILL.md` — bundled Anki companion skill for agents

Keep implementation and workflow guidance here. Keep user-facing usage docs in `docs.md`.

## Anki Terms

Use Anki terminology precisely:

- **Note** — stored data with fields
- **Card** — study prompt generated from a note
- **Note Type** — schema plus card templates
- **Field** — named value on a note, here `Front` and `Back`
- **Deck** — container for cards

Users create notes. Anki generates cards from those notes.

## Commands

```bash
bun run generate    # Refresh shiki-data.json and config.json from installed Shiki
bun run build       # Generate data and build renderer/editor assets
bun run watch       # Watch TypeScript and Vite builds
bun run dev         # Symlink add-on into Anki and open Chrome DevTools
bun run preview     # Preview the built Vite bundle
bun run test        # Run offline Python tests
bun run test:online # Run online-only Python tests
bun run test:all    # Run all Python tests
bun run format      # Format the repository with Prettier
bun run package     # Build and create anki-markdown.ankiaddon
bun run release     # Bump version, tag, and push
```

`bun run dev` requires macOS, Anki desktop, and Google Chrome. Never run `bun run release` without explicit user approval.

## Repository Layout

```text
src/                     TypeScript sources for card rendering and editor integration
anki_markdown/           Python add-on package plus built assets
anki_markdown/templates/ Note type templates used by Front/Back cards
scripts/                 Generate, debug, and release scripts
tests/                   Python tests for shiki.py
fixtures/                Importable Anki fixtures, including the kitchen-sink deck
skills/anki/             Bundled Anki companion skill and helper script
```

## Source vs Generated Files

Edit source files, not build artifacts.

- Edit: `src/*`, `anki_markdown/*.py`, `anki_markdown/templates/*`, `scripts/*`, docs, tests, skill files
- Generated: `anki_markdown/_review.js`, `anki_markdown/_review.css`, `anki_markdown/web/*`, `anki_markdown/shiki-data.json`, `anki_markdown/config.json`

If a change affects rendering, editor behavior, or Shiki metadata, run `bun run generate` or `bun run build` as appropriate.

## Runtime Flow

### Profile Startup

`anki_markdown/__init__.py` runs on profile load and:

1. downloads missing Shiki languages and themes with `store.sync(get_config())`
2. syncs `_`-prefixed media files into `collection.media`
3. creates or updates the `Anki Markdown` note type
4. registers `web/editor.js` and `web/editor.css` for the editor webview
5. registers the settings dialog

### Editor Save Path

`editor_will_munge_html` converts simple HTML back into markdown before save for `Anki Markdown` notes. That keeps stored field content clean even if Anki emits HTML while editing.

### Card Rendering

`src/render.ts` powers reviewed cards:

- reads config from the injected `#anki-md-config` JSON script
- renders markdown with `markdown-exit` plus the compatibility plugins `markdown-it-mark` and `markdown-it-github-alerts`
- loads configured Shiki languages and themes dynamically
- renders immediately with a styled fallback code shell, then upgrades code blocks and inline code in place once Shiki is ready
- normalizes dark mode to `html.night-mode`

Field values are passed through hidden `<script type="text/plain">` nodes with ids `data-front` and `data-back`. Keep those ids stable.

### Editor Integration

`src/editor.ts` activates only for the `Anki Markdown` note type. It uses:

- `anki/ui` for the `loaded` promise
- `anki/NoteEditor` for field access
- `anki/PlainTextInput` for CodeMirror lifecycle and instances

When active, it:

1. adds `anki-md-active` to `<body>`
2. forces all fields into plain-text mode
3. disables HTML tag closing, image shrinking, and MathJax toggles
4. sets CodeMirror mode to `"null"` to disable HTML-oriented highlighting

`src/editor.css` hides the rich-text wrapper with a visually hidden pattern so drag and drop still works, and hides the plain-text badge plus editor controls that do not apply to markdown notes.

## Shiki Data

`scripts/generate.ts` reads the installed `shiki` package and updates:

- `anki_markdown/shiki-data.json`
- `anki_markdown/config.json`

`anki_markdown/shiki.py` owns language and theme download logic. Its important layers are:

- pure helpers: `esm_url`, `is_alias_module`, `lang_deps`, `rewrite_lang_imports`
- network fetch: `fetch_module`
- filesystem store: `ShikiStore`

Tests in `tests/test_shiki.py` import `shiki.py` directly without loading Anki.

## Research

When changing editor or WebView integration, verify assumptions against the upstream Anki source. The local code uses only a small slice of Anki's runtime API, and those interfaces are easiest to confirm in Anki itself.

Useful upstream files in the Anki repo:

- `ts/lib/tslib/runtime-require.ts`
- `ts/lib/tslib/ui.ts`
- `ts/editor/NoteEditor.svelte`
- `ts/editor/plain-text-input/PlainTextInput.svelte`

Useful runtime checks in Chrome DevTools:

- `ankiListPackages()`
- `ankiRequire("anki/NoteEditor")`
- inspect globals such as `setPlainTexts`, `setCloseHTMLTags`, and `setShrinkImages`

Keep reviewer WebViews and editor WebViews distinct. This repo uses both, and the available APIs differ between them.

## Companion Skill

The repo includes the bundled Anki agent skill at `skills/anki/SKILL.md`.

If you change agent-facing note conventions or workflows:

- keep `skills/anki/SKILL.md`, `readme.md`, and `docs.md` in sync
- preserve the skill requirement to use the `Anki Markdown` note type
- preserve the requirement to get explicit user approval before adding cards to Anki

## Verification

Use the smallest verification that matches the change:

- Python or Shiki logic: `bun run test`
- Network-dependent Shiki behavior: `bun run test:online`
- Renderer/editor/build pipeline: `bun run build`
- End-to-end Anki check: `bun run dev`

For a quick smoke test in Anki, import `fixtures/kitchen-sink-deck.apkg`.

## Invariants

- The note type name must stay `Anki Markdown`.
- The note fields must stay `Front` and `Back`.
- `_`-prefixed files are synced to `collection.media` and must remain mobile-safe.
- `web/` assets are desktop-only add-on web exports.
- `front.html` and `back.html` must keep the same script ids and wrapper structure. `back.html` is the only one with a `.back` container.
- Update existing rendered nodes in place. Do not replace the parent wrapper with `innerHTML`, because Anki caches reviewer DOM references.
- Preserve the progressive code-rendering path in `src/render.ts`: fallback code blocks should keep the styled toolbar shell and upgrade in place after Shiki loads.
- The safe inline/block HTML allow-list in `src/render.ts` is intentionally narrow: `img`, `a`, `b`, `i`, `em`, `strong`, `br`, `kbd`.

## When Editing

- If you change template structure, update both `anki_markdown/templates/front.html` and `anki_markdown/templates/back.html`.
- If you change editor activation logic, verify both `src/editor.ts` and `src/editor.css`.
- If you change Shiki config or versioning, run `bun run generate`.
- If you change Python sync logic, keep `tests/test_shiki.py` aligned.
- If you change the Anki skill workflow, update `skills/anki/SKILL.md`, `readme.md`, and `docs.md` together.
