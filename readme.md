# Anki Markdown

> Anki add-on for Markdown notes with syntax highlighting powered by [Shiki](https://shiki.style)

Write flashcards in Markdown with full [syntax highlighting](docs.md#code-blocks). Supports light and dark mode across desktop and mobile.

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
- Generates `AVAILABLE_LANGS` and `AVAILABLE_THEMES` lists in `shiki.py` (including all aliases)
- Updates `anki_markdown/config.json` with defaults
- Sets `SHIKI_VERSION` from `package.json` dependencies
- Cleans stray `_lang-*.js` / `_theme-*.js` files

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
