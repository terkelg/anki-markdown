# Anki Markdown Syntax

This document covers all supported markdown and code highlighting features.

## Basic Markdown

Standard markdown syntax is supported via [markdown-it](https://github.com/markdown-it/markdown-it):

- **Bold**: `**text**` or `__text__`
- *Italic*: `*text*` or `_text_`
- ~~Strikethrough~~: `~~text~~`
- `Inline code`: `` `code` ``
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

### Supported Languages

| Language   | Aliases     |
|------------|-------------|
| JavaScript | `js`        |
| TypeScript | `ts`        |
| Rust       |             |
| CSS        |             |
| HTML       |             |
| JSON       |             |
| Bash       | `sh`        |

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

## CSS Classes

The transformers add these CSS classes for styling:

| Feature | Class |
|---------|-------|
| Line highlight | `.highlighted` |
| Word highlight | `.highlighted-word` |
| Focus | `.focused` |
| Error | `.highlighted.error` |
| Warning | `.highlighted.warning` |
| Container with focus | `.has-focused` |
| Container with highlight | `.has-highlighted` |

## Customization

Override font size and line height in your note type's Styling section (**Browse > Cards > Styling**):

```css
.card {
  --font-size: 1.25rem;
  --line-height: 1.6;
}
```

Defaults are `14px` (desktop) / `12px` (mobile) and `1.5`. All other sizes are relative to these values.
