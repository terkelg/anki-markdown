# Anki Markdown

> Anki add-on for Markdown notes with syntax highlighting powered by [Shiki](https://shiki.style)

Write flashcards in Markdown with beautiful code blocks, inline syntax highlighting, and code annotations. Supports light and dark mode. Requires Anki 2.1.55+.

> [!NOTE]
> **Install:** In Anki, go to **Tools → Add-ons → Get Add-ons** and enter code [`1172202975`](https://ankiweb.net/shared/info/1172202975)

**[View Documentation](docs.md)** — Full syntax guide with examples

## Architecture

`src/` contains TypeScript/CSS that compiles to `anki_markdown/`. Python and templates are used directly.

Anki has two webview contexts with different file access:

| Context       | Files          | Location            | Syncs to mobile |
| ------------- | -------------- | ------------------- | --------------- |
| Card reviewer | `_review.*`    | `collection.media/` | Yes             |
| Note editor   | `web/editor.*` | Add-on exports      | No              |

Files prefixed with `_` are synced to Anki's media folder, which syncs to AnkiWeb and mobile apps. Editor files use add-on web exports (desktop only).

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

## Testing in Anki

> **Note:** Anki caches the add-on. You must restart Anki for changes to take effect.

```bash
bun run debug
```

This creates the symlink and launches Anki with remote debugging enabled. Then open Chrome and navigate to `chrome://inspect` to access the webview console.

To do a manual symlink run the following command:

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
