# Anki Markdown

> Anki markdown with beautiful code rendering using Shiki

## Development

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
