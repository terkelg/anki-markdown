# Anki Markdown Syntax

This document covers all supported markdown and code highlighting features.

## Basic Markdown

Standard markdown syntax is supported via [markdown-it](https://github.com/markdown-it/markdown-it):

- **Bold**: `**text**` or `__text__`
- *Italic*: `*text*` or `_text_`
- ~~Strikethrough~~: `~~text~~`
- ==Highlighted==: `==text==`
- Keyboard keys: `<kbd>Ctrl</kbd>` (see below)
- `Inline code`: `` `code` ``
- Highlighted inline code: `` `code`{lang} `` (see below)
- [Links](url): `[text](url)`
- Images: `![alt](url)`
- Lists, blockquotes, tables, etc.

## Code Blocks

Fenced code blocks with syntax highlighting:

~~~markdown
```javascript
const greeting = "Hello, World!"
console.log(greeting)
```
~~~


## Inline Code Highlighting

Add syntax highlighting to inline code using `` `code`{lang} `` or `` `code`{.lang} ``:

~~~markdown
Use `const x = 1`{js} to declare a variable.
In Python, use `print("hello")`{python} to output text.
~~~

Both `{lang}` and `{.lang}` (Pandoc-style) syntaxes are supported.

## Line Highlighting

Highlight specific lines using `{lines}` in the meta string:

~~~markdown
```js {2}
const a = 1
const b = 2  // this line highlighted
const c = 3
```
~~~

### Line Ranges

~~~markdown
```js {1,3-5}
line 1  // highlighted
line 2
line 3  // highlighted
line 4  // highlighted
line 5  // highlighted
line 6
```
~~~

## Word Highlighting

Highlight specific words using `/pattern/` in the meta string:

~~~markdown
```js /greeting/
const greeting = "Hello"
console.log(greeting)
```
~~~

Multiple patterns:

~~~markdown
```js /hello/ /world/
const hello = "Hello"
const world = "World"
```
~~~

## Focus

Draw attention to specific lines. Other lines are dimmed.

### Single Line

~~~markdown
```js
const a = 1
const b = 2 // [!code focus]
const c = 3
```
~~~

### Multiple Lines

~~~markdown
```js
const a = 1 // [!code focus:3]
const b = 2
const c = 3
const d = 4
```
~~~

## Error & Warning Levels

Mark lines with error or warning indicators:

~~~markdown
```js
const valid = true
const bug = false // [!code error]
const risky = maybe // [!code warning]
```
~~~

## Combining Features

Features can be combined:

~~~markdown
```ts {1} /Result/
type Result<T> = T | Error  // highlighted line + word
function process(): Result<string> {
  return "ok" // [!code focus]
}
```
~~~

## Keyboard Shortcuts

Style keyboard keys using HTML `<kbd>` tags:

```markdown
Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to copy.
```

Combine multiple keys:

```markdown
<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> opens the command palette.
```

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

Five types available: `NOTE` (blue), `TIP` (green), `IMPORTANT` (purple), `WARNING` (yellow), `CAUTION` (red).

## Customization

Override styles in your note type's Styling section (**Browse > Cards > Styling**):

```css
.card {
  --font-size: 1.25rem;
  --line-height: 1.6;
}
```

### Alert Colors

Customize alert/callout colors:

```css
:root {
  --note: #2563eb;
  --tip: #16a34a;
  --important: #7c3aed;
  --warning: #ca8a04;
  --caution: #dc2626;
}
```

Night mode overrides use the same variables with brighter defaults for visibility.
