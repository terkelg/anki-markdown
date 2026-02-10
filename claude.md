# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Anki add-on that renders markdown with code syntax highlighting using Shiki. Creates a custom "Anki Markdown" note type with Front/Back fields.

## Documentation

- `readme.md` — Developer documentation (architecture, build, debug)
- `docs.md` — **End-user documentation only** (syntax guide, features, customization). Do not include developer/implementation details here.

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
bun run dev      # Start dev server at localhost:5173
bun run build    # Compile TypeScript and bundle for add-on
bun run debug    # Symlink add-on and launch Anki with remote debugging (port 9222)
bun run package  # Build and create .ankiaddon file
bun run release  # Bump version, tag, and push (triggers GitHub release)

# IMPORTANT: Never run `bun run release` without explicit user permission.
```

Debug in Chrome at `chrome://inspect`. To test locally, disable the installed version of the add-on in Anki's add-on manager first, otherwise it conflicts with the symlinked dev version.

## Architecture

```
src/                     # TypeScript source (compiled by Vite)
├── render.ts            # Card renderer → _review.js
├── style.css            # Card styles → _review.css
├── editor.ts            # Editor integration → web/editor.js
└── editor.css           # Editor styles → web/editor.css

anki_markdown/           # Anki add-on (symlinked to Anki addons folder)
├── __init__.py          # Python entry point - hooks into Anki, syncs media, manages note type
├── manifest.json        # Add-on metadata
├── templates/           # Card templates
├── _review.js           # Card renderer (built, syncs to mobile)
├── _review.css          # Card styles (built, syncs to mobile)
└── web/                 # Editor files (built, desktop only)
```

Key patterns:

- Files prefixed with `_` are synced to `collection.media` (works on mobile/AnkiWeb)
- Files in `web/` use add-on exports (desktop only)
- `ensure_notetype()` creates/updates the custom note type on profile load

## ESM in Anki Templates

ESM works in Anki templates with placeholder elements:

```html
<div class="anki-md-wrapper">
  <div class="front"></div>
  <div class="back"></div>
</div>
<script type="module">
  import { render } from "./_review.js";
  render(front, back);
</script>
```

**Critical**: Don't replace parent `innerHTML` — mutate children instead. Anki's reviewer.js caches element references after initial parse. Using `parent.innerHTML = ...` destroys elements and invalidates those references, causing null errors. Instead, populate existing elements: `frontEl.innerHTML = content`.

**Important**: Always keep `front.html` and `back.html` templates in sync. They should have the same DOM structure — the only difference is `back.html` includes the `.back` div while `front.html` only has `.front`. Same applies to dev templates in `test/` — keep them structurally consistent with production templates.

## Shiki Notes

- `@shikijs/core` treats `text`/`plaintext`/`plain`/`txt` as built-in plain languages, so no language import is required for the fallback.
- If theme imports fail, skip Shiki highlighting and render plain markdown to avoid blocking card rendering.

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

| Variable            | Light     | Dark      | Description                   |
| ------------------- | --------- | --------- | ----------------------------- |
| `--fg`              | `#020202` | `#fcfcfc` | Default text/icon color       |
| `--fg-subtle`       | `#737373` | `#858585` | Placeholder text, idle icons  |
| `--fg-disabled`     | `#858585` | `#737373` | Disabled UI elements          |
| `--fg-faint`        | `#afafaf` | `#545454` | Barely visible against canvas |
| `--fg-link`         | `#1d4ed8` | `#bfdbfe` | Hyperlink color               |
| `--canvas`          | `#f5f5f5` | `#2c2c2c` | Window background             |
| `--canvas-elevated` | `white`   | `#363636` | Container background          |
| `--canvas-inset`    | `white`   | `#2c2c2c` | Input background              |
| `--canvas-code`     | `white`   | `#252525` | Code editor background        |
| `--border`          | `#c4c4c4` | `#202020` | Medium contrast border        |
| `--border-subtle`   | `#e4e4e4` | `#252525` | Low contrast border           |
| `--border-strong`   | `#858585` | `#020202` | High contrast border          |
| `--border-focus`    | `#3b82f6` | `#3b82f6` | Focused input border          |
| `--shadow`          | `#c4c4c4` | `#141414` | Default box-shadow            |

### Button Colors

| Variable                      | Description               |
| ----------------------------- | ------------------------- |
| `--button-bg`                 | Button background         |
| `--button-gradient-start/end` | Button gradient           |
| `--button-hover-border`       | Hover state border        |
| `--button-disabled`           | Disabled background       |
| `--button-primary-bg`         | Primary button background |

### Props

| Variable                 | Value    | Description           |
| ------------------------ | -------- | --------------------- |
| `--border-radius`        | `5px`    | Default corner radius |
| `--border-radius-medium` | `12px`   | Container corners     |
| `--border-radius-large`  | `15px`   | Pill-shaped buttons   |
| `--transition`           | `180ms`  | Default transition    |
| `--transition-medium`    | `500ms`  | Medium transition     |
| `--transition-slow`      | `1000ms` | Slow transition       |

## Anki JavaScript API Reference

Anki exposes several packages to webviews via a global `require()` function. These APIs allow add-ons to hook into the editor, access Svelte stores, and integrate with Anki's UI components.

### Discovery & Research

**How to explore available APIs:**

1. **Source Code** (most reliable):
   - Repository: https://github.com/ankitects/anki
   - Key files:
     - `ts/lib/tslib/runtime-require.ts` - Shows all available packages
     - Search for `registerPackage(` to find what each package exports
     - `ts/editor/NoteEditor.svelte` - See global functions exposed

2. **Runtime discovery** (in browser console):

   ```javascript
   ankiListPackages(); // List all available packages
   ankiRequire("anki/NoteEditor"); // Inspect a package
   ```

3. **Documentation**:
   - Official: https://addon-docs.ankiweb.net/
   - Forums: https://forums.ankiweb.net/c/development/8

### Available Packages

#### `anki/packages`

**Purpose:** Meta-package for discovering and loading other packages.

| Function                | Description                                   |
| ----------------------- | --------------------------------------------- |
| `require(name)`         | Load a package by name                        |
| `listPackages()`        | Returns array of all registered package names |
| `hasPackages(...names)` | Check if packages are available               |

**Source:** `ts/lib/tslib/runtime-require.ts`

---

#### `svelte` / `svelte/store`

**Purpose:** Svelte framework re-exported by Anki.

**Store exports:**

| Export                | Description                     |
| --------------------- | ------------------------------- |
| `writable(value)`     | Create a writable store         |
| `readable(value)`     | Create a read-only store        |
| `derived(stores, fn)` | Create a derived store          |
| `get(store)`          | Get current value synchronously |

**Store methods:**

- `.set(value)` - Set value
- `.subscribe(fn)` - Subscribe to changes, returns unsubscribe function
- `.update(fn)` - Update with callback

**Docs:** https://svelte.dev/docs/svelte/svelte-store

---

#### `anki/ui`

**Purpose:** UI readiness signal - a promise that resolves when UI is loaded.

| Export   | Description                            |
| -------- | -------------------------------------- |
| `loaded` | Promise that resolves when UI is ready |

**Source:** `ts/lib/tslib/ui.ts`

---

#### `anki/bridgecommand`

**Purpose:** Communication between webview and Python backend.

| Function                        | Description                    |
| ------------------------------- | ------------------------------ |
| `bridgeCommand(cmd, callback?)` | Send command to Python backend |

**Common commands:** `"attach"`, `"record"`, `"ans"`, `"focus:N"`, `"blur:N:noteId:content"`, `"saveTags:json"`, `"updateToolbar"`, etc.

**Source:** `ts/lib/tslib/bridgecommand.ts`

---

#### `anki/shortcuts`

**Purpose:** Keyboard shortcut registration.

| Function                                              | Description                                                                       |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| `registerShortcut(callback, keyCombination, params?)` | Register a keyboard shortcut. Returns unsubscribe function                        |
| `getPlatformString(keyCombination)`                   | Convert key combo to platform-specific display string (e.g., "Ctrl" → "⌘" on Mac) |

**Key combination format:** `"Control+Shift+T"`, `"F3"`, `"Control+Alt?+B"` (? = optional modifier)

**Source:** `ts/lib/tslib/shortcuts.ts`

---

#### `anki/theme`

**Purpose:** Theme/dark mode detection.

| Export      | Description                                      |
| ----------- | ------------------------------------------------ |
| `pageTheme` | Svelte readable store with `{ isDark: boolean }` |

**Usage:**

```javascript
const { pageTheme } = require("anki/theme");
pageTheme.subscribe((theme) => console.log(theme.isDark));
```

**Source:** `ts/lib/sveltelib/theme.ts`

---

#### `anki/location`

**Purpose:** Selection/caret position save and restore utilities.

| Export                                 | Description                                   |
| -------------------------------------- | --------------------------------------------- |
| `Position`                             | Enum: `Before (-1)`, `Equal (0)`, `After (1)` |
| `saveSelection(baseNode)`              | Save current selection state                  |
| `restoreSelection(baseNode, location)` | Restore a saved selection                     |

**Source:** `ts/lib/domlib/location/`

---

#### `anki/surround`

**Purpose:** Text formatting (bold, italic, etc.) for rich text editor.

| Export       | Description                        |
| ------------ | ---------------------------------- |
| `Surrounder` | Class for managing text formatting |

**Surrounder methods:**

- `.registerFormat(key, format)` - Register a format (e.g., "bold")
- `.surround(formatName, exclusives?)` - Toggle format on selection
- `.overwriteSurround(formatName, exclusives?)` - Apply format (overwrite existing)
- `.isSurrounded(formatName)` - Check if selection has format
- `.remove(formatNames, reformatNames?)` - Remove formats from selection
- `.active` - Readable store indicating if surrounder is active

**Source:** `ts/editor/surround.ts`

---

#### `anki/PlainTextInput`

**Purpose:** Plain text (CodeMirror) editor component API.

| Export      | Description                                                      |
| ----------- | ---------------------------------------------------------------- |
| `lifecycle` | `{ onMount(fn), onDestroy(fn) }` - Hook into component lifecycle |
| `instances` | Array of active PlainTextInput instances                         |

**Note:** `closeHTMLTags` store exists in the component but is NOT exported in the package. Use `window.setCloseHTMLTags(bool)` instead (exposed globally by NoteEditor).

**Source:** `ts/editor/plain-text-input/PlainTextInput.svelte`

---

#### `anki/RichTextInput`

**Purpose:** Rich text (contentEditable) editor component API.

| Export       | Description                               |
| ------------ | ----------------------------------------- |
| `context`    | Svelte context for RichTextInput          |
| `surrounder` | Shared Surrounder instance for formatting |
| `lifecycle`  | `{ onMount(fn), onDestroy(fn) }`          |
| `instances`  | Array of active RichTextInput instances   |

**Source:** `ts/editor/rich-text-input/RichTextInput.svelte`

---

#### `anki/EditorField`

**Purpose:** Field container component (wraps PlainText + RichText inputs).

| Export      | Description                           |
| ----------- | ------------------------------------- |
| `context`   | Svelte context for EditorField        |
| `lifecycle` | `{ onMount(fn), onDestroy(fn) }`      |
| `instances` | Array of active EditorField instances |

**Source:** `ts/editor/EditorField.svelte`

---

#### `anki/NoteEditor`

**Purpose:** Main note editor component API.

| Export      | Description                          |
| ----------- | ------------------------------------ |
| `context`   | Svelte context for NoteEditor        |
| `lifecycle` | `{ onMount(fn), onDestroy(fn) }`     |
| `instances` | Array of active NoteEditor instances |

**Global functions exposed by NoteEditor on `window`:**

- `setCloseHTMLTags(bool)` - Enable/disable HTML tag auto-closing
- `setShrinkImages(bool)` - Shrink images by default
- `setFields(fields)` - Set field data
- `focusField(index)` - Focus a specific field
- `saveNow()` - Save immediately
- `setTags(tags)` - Set note tags
- `setCollapsed(collapsed)` - Set collapsed state
- `setPlainTexts(defaults)` - Set plain text defaults
- ... and many more (see NoteEditor.svelte `onMount` for complete list)

**Source:** `ts/editor/NoteEditor.svelte`

---

#### `anki/TemplateButtons`

**Purpose:** Media attachment buttons (paperclip, microphone, LaTeX).

| Export                | Description                                  |
| --------------------- | -------------------------------------------- |
| `resolveMedia(media)` | Callback to resolve media attachment promise |

**Source:** `ts/editor/editor-toolbar/TemplateButtons.svelte`

---

#### `anki/reviewer`

**Purpose:** Card review/study screen API (for reviewing cards, not editing).

| Export         | Description                                                   |
| -------------- | ------------------------------------------------------------- |
| `onUpdateHook` | Array of callbacks called before MathJax renders              |
| `onShownHook`  | Array of callbacks called after images load + MathJax renders |

**Usage:** Append functions to these arrays to run code when questions/answers are shown.

**Source:** `ts/reviewer/index.ts`

---

### Quick Reference: Most Useful APIs

| Package               | Key Use Case                                        |
| --------------------- | --------------------------------------------------- |
| `anki/packages`       | Discover available APIs                             |
| `anki/shortcuts`      | Add keyboard shortcuts                              |
| `anki/bridgecommand`  | Communicate with Python backend                     |
| `anki/theme`          | Detect dark/light mode                              |
| `anki/NoteEditor`     | Hook into editor lifecycle, access global functions |
| `anki/PlainTextInput` | Hook into CodeMirror lifecycle                      |
| `svelte/store`        | Work with reactive stores                           |
