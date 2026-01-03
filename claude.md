# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Anki add-on that renders markdown with code syntax highlighting using Shiki. Creates a custom "Anki Markdown" note type with Front/Back fields.

## Anki Terminology

Use correct Anki terminology in code, comments, and documentation:
- **Note**: Source data container with fields (like a database record)
- **Card**: Generated flashcard for studying (created from a note via templates)
- **Note Type**: Schema defining fields and card templates (our add-on creates "Anki Markdown" note type)
- **Fields**: Individual data pieces within a note (e.g., Front, Back)
- **Deck**: Organizational container for cards

Key distinction: Users create **notes**, Anki generates **cards** from them. One note can produce multiple cards.

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

## ESM in Anki Templates

ESM works in Anki templates with placeholder elements:

```html
<div class="card">
  <div class="front"></div>
  <div class="back"></div>
</div>
<script type="module">
  import { render } from "./_anki-md.js"
  render(...)
</script>
```

**Critical**: Don't replace parent `innerHTML` — mutate children instead. Anki's reviewer.js caches element references after initial parse. Using `parent.innerHTML = ...` destroys elements and invalidates those references, causing null errors. Instead, populate existing elements: `frontEl.innerHTML = content`.

**Important**: Always keep `front.html` and `back.html` templates in sync. They should have the same DOM structure — the only difference is `back.html` includes the `.back` div while `front.html` only has `.front`. Same applies to dev templates in `test/` — keep them structurally consistent with production templates.

## Editor Integration

The editor webview (`src/editor.ts` + `src/editor.css`) hides rich-text UI for markdown-only editing.

### Why visually hide instead of display:none?

Anki's editor webview has many built-in features: drag-drop media upload, paste handling, undo/redo, etc. These are driven by the `.rich-text-input` element. Using `display:none` completely breaks these features because the element is removed from the render tree.

After trying several approaches (custom editor, fully replacing the view), the most elegant solution is to **visually hide** the rich-text editor while keeping it functional:

```css
.rich-text-input {
  opacity: 0 !important;
  height: 0 !important;
  overflow: hidden !important;
  contain: strict;
}
```

This keeps the element in the DOM and functional (receiving events, handling drops) while being invisible. Users edit in the plain-text/source view which shows raw markdown.

### Selective activation

The `.anki-md-active` class is only applied when editing "Anki Markdown" note types:
- Python detects note type changes and calls `ankiMdActivate()` / `ankiMdDeactivate()`
- Other note types remain completely unaffected
- The JS/CSS is injected into the editor webview on add-on load

## Anki CSS Variables

Anki provides CSS variables for theming. Use these instead of hardcoded colors for light/dark mode support. Night mode uses `:root.night-mode` selector (note: different from our `.nightMode` class on cards).

### Colors
| Variable | Light | Dark | Description |
|----------|-------|------|-------------|
| `--fg` | `#020202` | `#fcfcfc` | Default text/icon color |
| `--fg-subtle` | `#737373` | `#858585` | Placeholder text, idle icons |
| `--fg-disabled` | `#858585` | `#737373` | Disabled UI elements |
| `--fg-faint` | `#afafaf` | `#545454` | Barely visible against canvas |
| `--fg-link` | `#1d4ed8` | `#bfdbfe` | Hyperlink color |
| `--canvas` | `#f5f5f5` | `#2c2c2c` | Window background |
| `--canvas-elevated` | `white` | `#363636` | Container background |
| `--canvas-inset` | `white` | `#2c2c2c` | Input background |
| `--canvas-code` | `white` | `#252525` | Code editor background |
| `--border` | `#c4c4c4` | `#202020` | Medium contrast border |
| `--border-subtle` | `#e4e4e4` | `#252525` | Low contrast border |
| `--border-strong` | `#858585` | `#020202` | High contrast border |
| `--border-focus` | `#3b82f6` | `#3b82f6` | Focused input border |
| `--shadow` | `#c4c4c4` | `#141414` | Default box-shadow |

### Button Colors
| Variable | Description |
|----------|-------------|
| `--button-bg` | Button background |
| `--button-gradient-start/end` | Button gradient |
| `--button-hover-border` | Hover state border |
| `--button-disabled` | Disabled background |
| `--button-primary-bg` | Primary button background |

### Props
| Variable | Value | Description |
|----------|-------|-------------|
| `--border-radius` | `5px` | Default corner radius |
| `--border-radius-medium` | `12px` | Container corners |
| `--border-radius-large` | `15px` | Pill-shaped buttons |
| `--transition` | `180ms` | Default transition |
| `--transition-medium` | `500ms` | Medium transition |
| `--transition-slow` | `1000ms` | Slow transition |
