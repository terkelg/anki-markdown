# Anki Markdown

A modern Anki add-on that transforms your flashcards with full markdown support and beautiful syntax highlighting.

## Why Use This Add-on?

- **Clean, Modern Styling** — Cards feature a polished design with light/dark mode support that matches Anki's native UI
- **Full Markdown Support** — Write cards using familiar markdown syntax including bold, italic, lists, blockquotes, tables, and more
- **Beautiful Code Highlighting** — Powered by [Shiki](https://shiki.style), the same syntax highlighter used by VS Code, with 300+ languages and 60+ themes to choose from
- **Advanced Code Features** — Line highlighting, word highlighting, focus mode, error/warning annotations, and a copy button
- **Mobile Compatible** — Works seamlessly on AnkiMobile and AnkiDroid

---

## Basic Markdown

Standard markdown syntax via [markdown-it](https://github.com/markdown-it/markdown-it):

| Syntax                   | Result            |
| ------------------------ | ----------------- |
| `**bold**` or `__bold__` | **bold**          |
| `*italic*` or `_italic_` | _italic_          |
| `~~strikethrough~~`      | ~~strikethrough~~ |
| `==highlighted==`        | ==highlighted==   |
| `` `inline code` ``      | `inline code`     |
| `[link](url)`            | [link](url)       |
| `![alt](image.jpg)`      | Image             |

### Keyboard Keys

Use HTML for keyboard shortcuts:

```html
Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to copy
```

### Lists

```markdown
- Unordered item
- Another item
  - Nested item

1. Ordered item
2. Another item
```

### Blockquotes

```markdown
> This is a blockquote
> It can span multiple lines
```

### Tables

```markdown
| Header 1 | Header 2 |
| -------- | -------- |
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |
```

---

## Code Blocks

Fenced code blocks with syntax highlighting powered by [Shiki](https://shiki.style):

````markdown
```javascript
const greeting = "Hello, World!";
console.log(greeting);
```
````

The language label appears in a toolbar below the code. If clipboard access is available, a **Copy** button lets you copy code with one click.

### Supported Languages

All major programming languages are supported including JavaScript, TypeScript, Python, Rust, Swift, Go, Java, C/C++, Ruby, PHP, SQL, HTML, CSS, JSON, YAML, Markdown, shell scripts, and [many more](https://shiki.style/languages).

---

## Inline Code Highlighting

Add syntax highlighting to inline code using `` `code`{lang} `` or `` `code`{.lang} ``:

```markdown
Use `const x = 1`{js} for constants and `let y = 2`{js} for variables.
In Python, use `print("hello")`{python} to output text.
```

Both `{lang}` and `{.lang}` (Pandoc-style) syntax work.

---

## Line Highlighting

Highlight specific lines using `{lines}` after the language:

````markdown
```js {2}
const a = 1;
const b = 2; // this line highlighted
const c = 3;
```
````

### Line Ranges

Use commas and ranges for multiple lines:

````markdown
```js {1,3-5}
line 1  // highlighted
line 2
line 3  // highlighted
line 4  // highlighted
line 5  // highlighted
line 6
```
````

---

## Word Highlighting

Highlight specific words or patterns using `/pattern/`:

````markdown
```js /greeting/
const greeting = "Hello";
console.log(greeting);
```
````

Multiple patterns:

````markdown
```js /hello/ /world/
const hello = "Hello";
const world = "World";
```
````

---

## Focus Mode

Draw attention to specific lines while dimming others. Hover over the code block or click **Reveal** to show all lines.

### Single Line

Add `// [!code focus]` comment to focus one line:

````markdown
```js
const a = 1;
const b = 2; // [!code focus]
const c = 3;
```
````

### Multiple Lines

Use `// [!code focus:n]` to focus n consecutive lines:

````markdown
```js
const a = 1; // [!code focus:3]
const b = 2;
const c = 3;
const d = 4;
```
````

---

## Error & Warning Annotations

Mark lines with error or warning indicators:

````markdown
```js
const valid = true;
const bug = false; // [!code error]
const risky = maybe; // [!code warning]
```
````

---

## Combining Features

All code features can be combined:

````markdown
```ts {1} /Result/
type Result<T> = T | Error; // highlighted line + word
function process(): Result<string> {
  return "ok"; // [!code focus]
}
```
````

---

## Alerts / Callouts

GitHub-style alerts for highlighting important information:

```markdown
> [!NOTE]
> Useful information the user should know.

> [!TIP]
> Helpful advice for better outcomes.

> [!IMPORTANT]
> Key information for success.

> [!WARNING]
> Urgent info requiring immediate attention.

> [!CAUTION]
> Potential negative consequences.
```

Five types: `NOTE` (blue), `TIP` (green), `IMPORTANT` (purple), `WARNING` (yellow), `CAUTION` (red).

---

## Settings

Configure syntax highlighting languages and themes via **Tools → Add-ons → Anki Markdown → Config**.

### Languages

Select which programming languages to enable for syntax highlighting. Only selected languages are downloaded and synced to your devices.

**Default languages:** JavaScript, TypeScript, Python, HTML, CSS, JSON, Bash, Markdown, GLSL, WGSL, Rust, Swift, Go

**Trade-off:** Each language adds ~20-100KB to your sync size. Enable only languages you actually use to keep sync times fast, especially on mobile.

All [Shiki languages](https://shiki.style/languages) (300+) are available including C/C++, Java, Ruby, PHP, SQL, Kotlin, Scala, Haskell, and many more.

### Themes

Choose separate themes for light and dark mode. Changes apply immediately after clicking **Save**.

**Default themes:** Vitesse Light / Vitesse Dark

All [Shiki themes](https://shiki.style/themes) are available including GitHub, Dracula, Nord, One Dark Pro, Tokyo Night, and more.

### Cardless

Enable **Cardless** to remove card border, shadow, and background on all screen sizes. Content stays centered with a max-width on wide screens but without any visual card chrome.

### How It Works

When you apply settings:

1. Missing language/theme files are downloaded from the internet
2. Files are synced to `collection.media` for mobile compatibility
3. Unused files are automatically removed

Files are only downloaded once and cached locally.

---

## Customization

Override default styles in your note type's Styling section (**Browse > Cards > Styling**).

### CSS Variables

| Variable              | Default | Description                    |
| --------------------- | ------- | ------------------------------ |
| `--font-size`         | `14px`  | Font size on wide screens      |
| `--font-size-mobile`  | `12px`  | Font size on small screens     |
| `--line-height`       | `1.5`   | Line height for text           |
| `--content-max-width` | `34rem` | Maximum width of card content  |

Example:

```css
.card {
  --font-size: 1rem;
  --line-height: 1.6;
  --content-max-width: 40rem;
}
```

### Alert Colors

| Variable      | Light     | Dark      |
| ------------- | --------- | --------- |
| `--note`      | `#2563eb` | `#318aff` |
| `--tip`       | `#16a34a` | `#19be56` |
| `--important` | `#7c3aed` | `#965bfb` |
| `--warning`   | `#ca8a04` | `#dc9703` |
| `--caution`   | `#dc2626` | `#dc2626` |

Example:

```css
:root {
  --note: #0ea5e9;
  --tip: #22c55e;
}
```

Night mode automatically uses brighter defaults for visibility.

---

## HTML Support

For safety, only these HTML tags are allowed in cards:

- `<img>` — images
- `<a>` — links
- `<b>`, `<i>`, `<em>`, `<strong>` — text formatting
- `<br>` — line breaks
- `<kbd>` — keyboard keys

All other HTML is stripped during rendering.

---

## AnkiMobile: Swipe Conflicts

On iOS, AnkiMobile uses horizontal swipe gestures to open the tools menu (swipe left) and deck browser (swipe right). These swipes are handled at the native app level and override horizontal scrolling inside code blocks.

To scroll code blocks horizontally on AnkiMobile, disable swipe gestures:

1. Open AnkiMobile **Preferences**
2. Go to **Review** > **Swipes**
3. Set left and right swipe actions to **Off**

You can still access tools and decks via the toolbar buttons. This does not affect AnkiDroid or desktop Anki.
