# Plan: User-Configurable Shiki Languages and Themes

**Issue:** #4
**Branch:** `feature/configurable-shiki`

## Summary

Add a settings GUI for users to select Shiki languages and themes. Python downloads ESM modules from esm.sh, saves them to `collection.media`, and updates card templates with the config. The renderer dynamically imports only selected languages/themes.

## Architecture

```
Before:
  _review.js (5.5MB) = markdown-it + ALL shiki languages + themes (hardcoded)

After:
  _review.js (~370KB)     = markdown-it + shiki core + JS regex engine
  _lang-{name}.js (each)  = individual language grammars (downloaded by Python)
  _theme-{name}.js (each) = individual themes (downloaded by Python)
  templates/              = config passed via inline JSON script
```

**Key principle:** Python downloads files as-is from esm.sh (no JS parsing). Config passed to JS via inline JSON script.

## Regex Engine Choice

Shiki supports two regex engines:

| Engine | Size | Compatibility | Best For |
|--------|------|---------------|----------|
| Oniguruma (WASM) | +608KB | 100% | Node.js, build-time |
| **JavaScript** | 0 | All built-in langs | **Browser, mobile** |

**We use the JavaScript engine** (`@shikijs/engine-javascript`) because:
- No extra WASM file to sync
- Smaller total bundle
- All standard Shiki languages supported (since v3.9.1)
- Better fit for browser/webview environments like Anki

## Bundle Sizes (with 8 default languages)

| File | Size |
|------|------|
| `_review.js` | 366 KB |
| `_review.css` | 7 KB |
| Languages (8) | ~680 KB |
| Themes (2) | ~32 KB |
| **Total** | **~1.1 MB** |

Down from 5.5MB — **80% reduction**.

## Files to Create

### `anki_markdown/config.json`
Default configuration (user edits stored in meta.json automatically):
```json
{
  "languages": ["javascript", "typescript", "python", "html", "css", "json", "bash", "markdown"],
  "themes": { "light": "vitesse-light", "dark": "vitesse-dark" },
  "shikiVersion": "3.20.0"
}
```

**Note:** Minimal defaults (~680KB for languages). No aliases - users use exact Shiki names.

### `anki_markdown/shiki.py`
Handles downloading and file management:
- `fetch_lang(name, version)` - download from esm.sh, save as `_lang-{name}.js`
- `fetch_theme(name, version)` - download from esm.sh, save as `_theme-{name}.js`
- `sync_shiki_files()` - ensure all configured langs/themes exist in collection.media
- `cleanup_unused()` - remove `_lang-*.js` / `_theme-*.js` files not in config
- `is_alias_module()` - detect and resolve language aliases (e.g., bash → shellscript)
- `AVAILABLE_LANGS` / `AVAILABLE_THEMES` - lists of all shiki-supported options

### `anki_markdown/settings.py`
PyQt settings dialog:
- Multi-select list for languages (with search/filter)
- Dropdowns for light/dark theme
- Apply button triggers download + sync

## Files to Modify

### `anki_markdown/__init__.py`
- Add `setConfigAction()` hook for settings dialog
- Call `sync_shiki_files()` on profile load
- Update `ensure_notetype()` to inject config into templates

### `anki_markdown/templates/front.html` and `back.html`
Config injected as inline JSON (Python-managed, prepended to template):
```html
<script type="application/json" id="anki-md-config">
{"languages":["javascript","typescript","python"],"themes":{"light":"vitesse-light","dark":"vitesse-dark"}}
</script>
```

### `src/render.ts`
- Use `@shikijs/core` with `@shikijs/engine-javascript`
- Read config from `#anki-md-config` element
- Dynamically import `_lang-{name}.js` and `_theme-{name}.js` files
- Create highlighter with loaded languages/themes

### `vite.config.ts`
- Externalize `_lang-*.js` and `_theme-*.js` dynamic imports
- Single bundle output (no WASM chunks)

## esm.sh URL Patterns

```
Languages: https://esm.sh/@shikijs/langs@{version}/es2022/dist/{name}.mjs
Themes:    https://esm.sh/@shikijs/themes@{version}/es2022/dist/{name}.mjs
```

Files export frozen JSON objects - no dependencies, self-contained.

## Critical Files

| File | Purpose |
|------|---------|
| `anki_markdown/__init__.py` | Entry point, hooks, sync |
| `anki_markdown/shiki.py` | Download + file management |
| `anki_markdown/settings.py` | Settings dialog |
| `anki_markdown/config.json` | Default config |
| `anki_markdown/templates/*.html` | Base templates (config injected) |
| `src/render.ts` | Dynamic imports, JS regex engine |
| `vite.config.ts` | External dynamic imports |

## Upgrade Path (v1 → v2)

When users upgrade from current hardcoded version:
1. `sync_media()` trashes old `_review.js` (5.5MB), adds new slim one (~370KB)
2. `sync_shiki_files()` downloads default language files on first profile load
3. `ensure_notetype()` updates templates with inline JSON config
4. Cards continue to work - templates are updated, new files synced

**No breaking changes** - existing cards render fine after sync completes.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| esm.sh down | Cache downloaded files; show helpful error |
| Dynamic import fails on mobile | Test early; keep all `_*` files in collection.media |
| User removes all languages | Require minimum 1 language in settings |
| Large download on first run | Show progress; allow cancel |
| Upgrade breaks cards | Templates auto-update; files auto-download on load |
