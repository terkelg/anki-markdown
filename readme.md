# Anki Markdown

> Anki add-on for Markdown notes with syntax highlighting powered by [Shiki](https://shiki.style)

Write flashcards in Markdown with full [syntax highlighting](docs.md#code-blocks). Pick from 300+ languages and 60+ themes — only your selections are downloaded and synced. Supports light and dark mode across desktop and mobile.

- **Only what you need** — pick from 300+ languages and 60+ themes, only your selections are downloaded and synced
- **Code blocks** with 300+ languages via Shiki
- **Inline code** syntax highlighting support
- **Line and word highlighting**
- **Alerts and callouts** in GitHub-style syntax
- **Settings panel** to pick languages and themes
- **AI agent friendly**, works great with MCP servers like [anki-mcp-server](https://github.com/nailuoGG/anki-mcp-server)


> [!NOTE]
> In Anki, go to `Tools → Add-ons → Get Add-ons` and enter [`1172202975`](https://ankiweb.net/shared/info/1172202975) to install.
> See the [documentation](docs.md) for all supported features.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="media/back-dark.png">
    <img src="media/back.png" alt="Anki Markdown card example" width="800">
  </picture>
</p>

## Usage

After installing the add-on:

1. **Create a new note** using the **Anki Markdown** note type (Add → Note Type dropdown → Anki Markdown)
2. **Write your question** in the Front field using markdown
3. **Write your answer** in the Back field using markdown
4. The markdown will be automatically rendered with syntax highlighting when you review the card

> [!NOTE]
> See the [documentation](docs.md) for all supported markdown features including code blocks, line highlighting, alerts, and more.

## Development

### Preview

For rapid iteration without restarting Anki:

```bash
bun run dev
```

Then open:

- `http://localhost:5173/front.html` - preview front card
- `http://localhost:5173/back.html` - preview back card
- Add `?night` to test night mode (e.g., `/front.html?night`)

Edit files in `src/` and the browser will hot-reload.

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

Requires Anki 2.1.55+. Note that Anki caches the add-on, so you must restart Anki for changes to take effect.

```bash
bun run debug
```

This creates the symlink and launches Anki with remote debugging enabled. Then open Chrome and navigate to `chrome://inspect` to access the webview console.

To do a manual symlink, run the following command:

```bash
ln -s "$(pwd)/anki_markdown" ~/Library/Application\ Support/Anki2/addons21/anki_markdown
```

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
- [Card Templates](https://docs.ankiweb.net/templates/intro.html)
- [Card Styling](https://docs.ankiweb.net/templates/styling.html) - Anki CSS classes (`.nightMode`, `.mac`, `.win`, `.mobile`, etc.)
