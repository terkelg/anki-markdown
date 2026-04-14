# Development

For local iteration against the real reviewer:

```bash
bun run dev
```

This symlinks the add-on into Anki, launches Anki with remote debugging enabled, waits for the main webview to load, and opens Chrome DevTools for it.

## Build

Compile TypeScript to the Anki add-on folder:

```bash
bun run build
```

This outputs `_review.js`, `_review.css`, and `web/editor.*` to `anki_markdown/`.

### Configuration

Default languages and themes are configured in `config.json`:

```json
{
  "languages": ["javascript", "typescript", "python", ...],
  "themes": { "light": "vitesse-light", "dark": "vitesse-dark" }
}
```

The build runs `bun run generate` which:
- Generates `anki_markdown/shiki-data.json` (version, languages, themes)
- Updates `anki_markdown/config.json` with defaults
- Cleans stray `_lang-*.js` / `_theme-*.js` files

## Tests

Python tests for `shiki.py` (language/theme download and management). Requires a one-time venv setup:

```bash
python3 -m venv .venv && .venv/bin/pip install pytest
```

```bash
bun run test           # offline (reads from node_modules)
bun run test:online    # online only (hits esm.sh)
bun run test:all       # all tests
```

Most tests read language/theme files from `node_modules/@shikijs/` instead of making network requests. Tests marked `@online` hit esm.sh to verify the CDN serves the same format.

## Testing in Anki

Requires Anki 25.x. Note that Anki caches the add-on, so you must restart Anki for changes to take effect. `bun run dev` requires macOS and Google Chrome.

For a quick renderer smoke test, import [fixtures/kitchen-sink-deck.apkg](./fixtures/kitchen-sink-deck.apkg).

> [!TIP]
> Install add-on [31746032](https://ankiweb.net/shared/info/31746032) for easier debugging.

## Release

Create a new release:

```bash
bun run release 1.0.0
```

This bumps the version in `package.json` and `manifest.json`, commits, tags, and pushes. The GitHub Action automatically builds and publishes the `.ankiaddon` file to the release.

## Resources

- [Anki Add-on Documentation](https://addon-docs.ankiweb.net/intro.html)
- [AnkiConnect](https://foosoft.net/projects/anki-connect/) - HTTP API for programmatic access to Anki
- [Card Templates](https://docs.ankiweb.net/templates/intro.html)
- [Card Styling](https://docs.ankiweb.net/templates/styling.html) - Anki CSS classes (`.nightMode`, `.mac`, `.win`, `.mobile`, etc.)
