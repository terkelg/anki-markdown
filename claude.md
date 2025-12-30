# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Anki add-on that renders markdown with code syntax highlighting using Shiki. Creates a custom "Anki Markdown" note type with Front/Back fields.

## Commands

```bash
bun run debug    # Symlink add-on and launch Anki with remote debugging (port 9222)
```

Debug in Chrome at `chrome://inspect`.

## Architecture

```
anki_markdown/           # Anki add-on (symlinked to Anki addons folder)
├── __init__.py          # Python entry point - hooks into Anki, syncs media, manages note type
├── manifest.json        # Add-on metadata
├── templates/           # Card templates using Anki's mustache-style syntax
│   ├── front.html
│   └── back.html
└── _anki-md.js          # Client-side JS (prefixed with _ for Anki media sync)
```

Key patterns:
- Files prefixed with `_` are auto-synced to Anki's collection.media folder
- Templates use `{{text:Field}}` syntax to pass field content to JS
- `ensure_notetype()` creates/updates the custom note type on profile load
- Future: Vite will build TypeScript from `client/` to `anki_markdown/_anki-md.js`
