# Design: Isolated TipTap Composer for Anki Markdown

Date: 2026-02-15
Status: Proposed (exploration approved)
Owner: anki-markdown

## 1. Why This Exists

Our current preview/editor integration is tightly coupled to Anki's internal editor DOM and runtime packages. It works, but it is fragile when upstream UI internals change.

This document proposes an isolation-first architecture:

1. Build our own Markdown-first composer UI with TipTap.
2. Use stable Anki Python/webview primitives for note and media operations.
3. Minimize dependence on internal `ts/editor/*` implementation details.

## 2. Decision Summary

Recommended direction:

1. Create a dedicated "Markdown Composer" UI (beta) powered by TipTap.
2. Keep current native Add Cards flow available in parallel during rollout.
3. Communicate with Python through webview bridge messages only.
4. Save notes through collection/operation APIs, not by mutating native editor field internals.

This gives us a safer migration path and a clear rollback option.

## 3. Goals

1. Markdown-first editing experience (Front, Back, Tags, Deck, Note Type).
2. Preserve markdown as canonical stored field content.
3. Support image/media insertion from file picker and paste.
4. Reuse existing markdown renderer for preview fidelity.
5. Reduce breakage risk from Anki editor UI updates.

## 4. Non-Goals (V1)

1. Replace every native editor feature on day one.
2. Full image occlusion workflow parity.
3. Browser edit screen replacement.
4. Perfect WYSIWYG parity with all markdown edge cases at launch.

## 5. API/Primitive Inventory

The following primitives are sufficient for a custom composer:

1. Webview asset injection and resource loading:
   1. `mw.addonManager.setWebExports(...)`
   2. `gui_hooks.webview_will_set_content(...)`
2. JS to Python bridge:
   1. `pycmd(...)` / `bridgeCommand(...)`
   2. `gui_hooks.webview_did_receive_js_message(...)` for command routing
3. Note operations:
   1. `col.new_note(notetype)`
   2. `col.add_note(note, deck_id)` or `aqt.operations.note.add_note(...)`
   3. `note.fields_check()` for empty/duplicate/cloze validation
4. Media operations:
   1. `col.media.add_file(path)` for file-based media
   2. `col.media.write_data(name, bytes)` for pasted/blob media
5. Tag parsing:
   1. `col.tags.split(...)`

Avoid relying on these as core contracts:

1. `require("anki/NoteEditor")` package internals.
2. Native editor field DOM/class structure.
3. Internal Svelte component shape.

## 6. TipTap Fit

Confirmed from package metadata:

1. `@tiptap/core` current: `3.19.0`
2. `@tiptap/starter-kit` current: `3.19.0`
3. Official markdown package exists: `@tiptap/markdown` current: `3.19.0` (MIT)

Planned usage:

1. Use TipTap as editing surface.
2. Use `@tiptap/markdown` as import/export boundary:
   1. initialize editor from markdown
   2. persist via `editor.getMarkdown()`
3. Keep our renderer (`src/markdown.ts`) as preview source of truth.

Known risk:

1. Markdown round-trip is not guaranteed to preserve every custom syntax byte-for-byte.
2. We must validate behavior for:
   1. fenced code info/meta
   2. raw HTML blocks
   3. GitHub alerts and custom markdown-it plugins

## 7. Proposed Architecture

### 7.1 Python Side

Add a dedicated controller module (suggested: `anki_markdown/composer.py`) that owns:

1. Webview creation/show lifecycle for composer window.
2. Bridge command handler namespace: `anki-md-composer:*`.
3. Data services:
   1. list decks
   2. list note types and fields
   3. create note
   4. add/upload media
4. Validation service:
   1. field emptiness
   2. cloze compatibility
   3. duplicate checks via `fields_check()`

### 7.2 Frontend Side

Add a new bundle target (suggested: `src/composer.ts` -> `anki_markdown/web/composer.js`) with:

1. TipTap editor instances for Front and Back.
2. Shared live preview panel (existing renderer).
3. Deck/Note Type selectors and tags input.
4. Toolbar actions:
   1. Add media
   2. Paste image upload
   3. Add note
   4. Clear

### 7.3 Bridge Contract (Draft)

Commands sent from JS:

1. `anki-md-composer:init`
2. `anki-md-composer:list-note-types`
3. `anki-md-composer:list-decks`
4. `anki-md-composer:add-media-dialog`
5. `anki-md-composer:add-media-bytes:<json>`
6. `anki-md-composer:validate:<json>`
7. `anki-md-composer:add-note:<json>`

Response shape:

1. `ok: boolean`
2. `data?: object`
3. `error?: string`
4. `warnings?: string[]`

## 8. Data Model (V1)

Request payload for add:

1. `noteTypeId: number`
2. `deckId: number`
3. `fields: { [fieldName: string]: string }` (markdown)
4. `tags: string[]`

Python mapping:

1. build note from selected note type
2. map known field names (at minimum Front/Back)
3. set tags
4. validate with `fields_check()`
5. add via operation API

## 9. Media Flow (V1)

### 9.1 File Picker Path

1. JS requests `add-media-dialog`.
2. Python opens native file chooser.
3. Python stores media via `col.media.add_file(path)`.
4. Python returns filename.
5. JS inserts markdown syntax:
   1. image: `![](filename)`
   2. audio: `[sound:filename]`

### 9.2 Pasted Image Path

1. JS captures pasted image blob/data URL.
2. JS sends bytes (base64) with extension hint.
3. Python decodes and stores with `col.media.write_data(...)`.
4. JS inserts `![](filename)`.

Guardrails:

1. max payload size per message for base64 path.
2. graceful failure if unsupported mime type.

## 10. Rollout Plan

### Phase 0: Spike (1-2 days)

1. Standalone TipTap view in add-on webview.
2. Load/save markdown string roundtrip.
3. Confirm bridge command pipeline.

Exit criteria:

1. can edit markdown and receive it in Python.

### Phase 1: Add Note MVP

1. Deck + note type + Front/Back + tags.
2. Validation and add note action.
3. Error handling surface in UI.

Exit criteria:

1. notes can be added reliably with markdown fields.

### Phase 2: Media

1. file picker media insertion
2. pasted image upload

Exit criteria:

1. media appears in stored markdown and renders in review.

### Phase 3: Preview + Styling

1. integrate existing renderer preview
2. polish Anki-native styling tokens/variables

Exit criteria:

1. preview fidelity is acceptable for common markdown features.

### Phase 4: Beta Toggle

1. config flag: `composer_mode = native | tiptap_beta`
2. optional entrypoint button in Add Cards

Exit criteria:

1. users can opt in/out without migration risk.

## 11. Risks and Mitigations

1. Markdown roundtrip drift.
   1. Mitigation: add corpus tests and provide optional raw markdown mode for problematic content.
2. Missing native parity (shortcuts/advanced behaviors).
   1. Mitigation: define V1 scope strictly, document unsupported features.
3. Bridge payload/latency issues for large paste blobs.
   1. Mitigation: use file picker path by default; cap blob size; show actionable errors.
4. API drift in Anki hooks.
   1. Mitigation: rely on documented hooks + collection/media APIs; minimize internal package coupling.

## 12. Test Plan

1. Unit tests (Python):
   1. command parsing
   2. note validation behavior
   3. media write paths
2. Integration tests (manual + scripted):
   1. add note success/failure paths
   2. duplicate/empty/cloze warnings
   3. image insert via dialog + paste
3. Markdown roundtrip corpus:
   1. code fences/meta
   2. inline code
   3. lists/tables/blockquote
   4. raw HTML blocks
   5. alert syntax

## 13. Open Questions

1. Should V1 support only Anki Markdown note type, or any note type with mapped fields?
2. Do we require strict markdown-preserving mode for unsupported TipTap tokens?
3. Should the composer open as:
   1. separate window, or
   2. panel inside Add Cards?
4. Do we keep current native editor preview code during beta, or freeze it and focus only on composer?

## 14. Suggested Immediate Next Steps

1. Approve architecture choice for window vs in-Add-Cards panel.
2. Implement Phase 0 spike on a dedicated branch.
3. Add markdown roundtrip corpus before Phase 1 feature expansion.

## References

1. Anki hook docs: https://addon-docs.ankiweb.net/hooks-and-filters.html
2. Anki GUI hooks list: https://github.com/ankitects/anki/blob/main/qt/tools/genhooks_gui.py
3. Anki webview bridge: https://github.com/ankitects/anki/blob/main/qt/aqt/webview.py
4. Anki editor media + bridge handling: https://github.com/ankitects/anki/blob/main/qt/aqt/editor.py
5. Add note operation wrapper: https://github.com/ankitects/anki/blob/main/qt/aqt/operations/note.py
6. Collection note APIs: https://github.com/ankitects/anki/blob/main/pylib/anki/collection.py
7. Media manager APIs: https://github.com/ankitects/anki/blob/main/pylib/anki/media.py
8. TipTap core package: https://www.npmjs.com/package/@tiptap/core
9. TipTap markdown package: https://www.npmjs.com/package/@tiptap/markdown
