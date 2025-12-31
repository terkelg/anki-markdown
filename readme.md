# Anki Markdown

> Anki markdown with beautiful code rendering using Shiki

## Development

### Browser Preview (Recommended)

For rapid iteration without restarting Anki:

```bash
bun run dev
```

Then open:
- `http://localhost:5173/front.html` - preview front card
- `http://localhost:5173/back.html` - preview back card
- Add `?night` to test night mode (e.g., `/front.html?night`)

Edit `src/main.ts` and the browser will hot-reload. The preview files contain sample markdown content to simulate Anki's template variables.

### Build

Compile TypeScript to the Anki add-on folder:

```bash
bun run build
```

This outputs `anki_markdown/_anki-md.js`.

### Testing in Anki

> **Note:** Anki caches the add-on. You must restart Anki for changes to take effect.

```bash
bun run debug
```

This creates the symlink and launches Anki with remote debugging enabled. Then open Chrome and navigate to `chrome://inspect` to access the webview console.

## Manual symlink

```bash
ln -s "$(pwd)/anki_markdown" ~/Library/Application\ Support/Anki2/addons21/anki_markdown
```

## Debugging

See [Anki Add-on Debugging Docs](https://addon-docs.ankiweb.net/debugging.html).

Install add-on [31746032](https://ankiweb.net/shared/info/31746032) for easier debugging.

## Resources

- [Anki Add-on Documentation](https://addon-docs.ankiweb.net/intro.html)
- [Card Templates](https://docs.ankiweb.net/templates/intro.html)
- [Card Styling](https://docs.ankiweb.net/templates/styling.html) - Anki CSS classes (`.nightMode`, `.mac`, `.win`, `.mobile`, etc.)
