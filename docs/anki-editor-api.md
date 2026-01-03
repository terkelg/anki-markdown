# Anki Editor API Research

Research notes on Anki's editor APIs, hooks, and image handling for add-on development.

## Critical Insight: "Plain Text Mode" is HTML Source View

**Anki's `plainText` field property does NOT create a plain text editor.** It creates an **HTML source editor** with syntax highlighting. This is fundamentally wrong for markdown editing.

Additionally, **session state overrides field defaults**. Even if you set `plainText = True`, if the user has ever edited that note type, their previous toggle state takes precedence.

## Editor Architecture

Anki's editor is built with:
- **Python backend** (`aqt/editor.py`) - handles clipboard, media, bridge commands
- **Svelte frontend** (`ts/editor/`) - UI components, field editing
- **WebView bridge** - `pycmd()` for JS→Python, `editor.web.eval()` for Python→JS

### Key Source Files
- [NoteEditor.svelte](https://github.com/ankitects/anki/blob/main/ts/editor/NoteEditor.svelte) - Main editor component
- [editor.py](https://github.com/ankitects/anki/blob/main/qt/aqt/editor.py) - Python editor class
- [genhooks_gui.py](https://github.com/ankitects/anki/blob/main/qt/tools/genhooks_gui.py) - Hook definitions
- [notetypes.proto](https://github.com/ankitects/anki/blob/main/proto/anki/notetypes.proto) - Field schema

## Relevant Hooks

### `webview_will_set_content`
Inject JS/CSS into editor webview.
```python
from aqt.webview import WebContent
from aqt.editor import Editor

def on_webview_content(web_content: WebContent, context) -> None:
    if not isinstance(context, Editor):
        return
    addon = mw.addonManager.addonFromModule(__name__)
    web_content.js.append(f"/_addons/{addon}/web/editor.js")
    web_content.css.append(f"/_addons/{addon}/web/editor.css")

gui_hooks.webview_will_set_content.append(on_webview_content)
```

### `editor_did_load_note`
Called when a note is loaded in the editor.
```python
def on_load(editor: Editor) -> None:
    if editor.note:
        notetype = editor.note.note_type()
        if notetype["name"] == "My Note Type":
            editor.web.eval("myActivateFunction()")

gui_hooks.editor_did_load_note.append(on_load)
```

### `webview_did_receive_js_message`
**Critical for image handling.** Intercept JS→Python bridge messages.
```python
def on_js_message(handled: tuple[bool, Any], message: str, context: Any):
    if message.startswith("myAddon:"):
        # Handle custom message
        return (True, result)
    return handled

gui_hooks.webview_did_receive_js_message.append(on_js_message)
```

### `editor_will_process_mime`
Intercept paste/drop MIME data before Anki processes it.
```python
from PyQt6.QtCore import QMimeData
from aqt.editor import EditorWebView

def on_process_mime(
    mime: QMimeData,
    editor_web_view: EditorWebView,
    internal: bool,      # paste between Anki fields
    extended: bool,      # extended paste mode
    drop_event: bool     # drag-drop vs paste
) -> QMimeData:
    return mime

gui_hooks.editor_will_process_mime.append(on_process_mime)
```

**Note:** This hook has issues detecting clipboard images reliably. `hasImage()` often returns `False`.

### `editor_did_init_shortcuts`
Register keyboard shortcuts.
```python
def add_shortcuts(shortcuts: list, editor: Editor):
    shortcuts.append(("Ctrl+Shift+M", lambda: toggle_markdown(editor)))

gui_hooks.editor_did_init_shortcuts.append(add_shortcuts)
```

## Field Configuration

### Field Properties (Protobuf Schema)
```protobuf
message Field {
  message Config {
    bool sticky = 1;
    bool rtl = 2;
    string font_name = 3;
    uint32 font_size = 4;
    string description = 5;
    bool plain_text = 6;      // HTML editor mode (NOT plain text!)
    bool collapsed = 7;
    bool exclude_from_search = 8;
  }
}
```

### Setting Field Properties
```python
def ensure_notetype():
    mm = mw.col.models
    m = mm.by_name("My Note Type")
    if m:
        for field in m["flds"]:
            field["plainText"] = True  # Enables HTML SOURCE view
        mm.save(m)
```

## JavaScript APIs (Global Scope)

NoteEditor.svelte exposes these to `globalThis`:
- `setFields(fields)` - Set field content
- `setPlainTexts(defaults)` - Set which fields use "plain text" (HTML source)
- `focusField(index)` - Focus a field
- `saveNow()` - Force save
- `setTags(tags)` - Set note tags

**Limitation:** `setPlainTexts()` only sets defaults. Session state overrides them.

## Image Handling

### How Anki Processes Images

1. User pastes/drops image
2. `_onPaste()` in editor.py processes clipboard
3. `_processMime()` checks in order: HTML → URLs → Images → Text
4. `_processImage()` saves to media via `_read_pasted_image()`
5. Returns HTML `<img src="filename.png">`
6. JS receives via `pasteHTML()` and inserts

### MIME Types
- `mime.hasImage()` - Raw image data (screenshots) - **often unreliable**
- `mime.hasUrls()` - File URLs (copied files from Finder)
- `application/x-qt-image` - Qt internal format
- `text/uri-list` - File paths from file managers

### Known Issues
- [#2772](https://github.com/ankitects/anki/issues/2772) - `hasImage()` unreliable
- [#3733](https://github.com/ankitects/anki/pull/3733) - Added `text/uri-list` support

## Attempted Approaches (Failed)

### 1. Plain Text Mode + Python MIME Hook
Set `plainText=True`, intercept images via `editor_will_process_mime`.

**Result:** ❌ Failed
- `hasImage()` unreliable
- "Plain text mode" is actually HTML source view
- Session state overrides field defaults

### 2. Rich Text Mode + JS MutationObserver
Let Anki handle images natively, use MutationObserver to convert `<img>` to markdown.

**Result:** ❌ Failed
- Observer timing issues with Anki's paste handling
- Rich text mode stores HTML, not markdown

## How markdown-input Add-on Solves This

The [markdown-input](https://github.com/TRIAEIOU/markdown-input) add-on is the reference implementation.

### Architecture
- Uses **CodeMirror 6** for the actual text editing
- **unified ecosystem** (hast/mdast) for HTML↔markdown conversion
- Toggle between rich text and markdown modes

### Hooks Used
```python
gui_hooks.webview_will_set_content.append(add_srcs)           # Inject JS/CSS
gui_hooks.editor_will_load_note.append(on_load_note)          # Initialize
gui_hooks.editor_did_init_shortcuts.append(add_shortcuts)     # Keyboard
gui_hooks.webview_did_receive_js_message.append(handle_msg)   # Bridge commands
```

### Image Handling Solution
They use a **custom bridge command**:

1. JS intercepts paste event
2. JS calls `pycmd('clipboard_image_to_markdown:' + base64data)`
3. Python handler receives image data
4. Python saves to media folder via `mw.col.media.add_file()`
5. Python returns markdown `![](filename)` to JS
6. JS inserts the markdown text

## Recommended Approaches

### Option A: Custom Bridge Command for Images

Python:
```python
import base64
import tempfile

def handle_js_message(handled, message, context):
    if not message.startswith("md_image:"):
        return handled

    data = base64.b64decode(message.split(":", 1)[1])
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        f.write(data)
        filename = mw.col.media.add_file(f.name)

    context.editor.web.eval(f'insertMarkdownImage("{filename}")')
    return (True, None)

gui_hooks.webview_did_receive_js_message.append(handle_js_message)
```

JavaScript:
```javascript
document.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const blob = item.getAsFile();
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                pycmd('md_image:' + base64);
            };
            reader.readAsDataURL(blob);
        }
    }
});
```

### Option B: Full CodeMirror Integration
Replace Anki's field editor with CodeMirror 6:
1. Inject CodeMirror bundle via `webview_will_set_content`
2. Replace contenteditable fields with CodeMirror instances
3. Handle all conversions in JS

### Option C: Fork markdown-input
Use their libraries:
- `anki-md-html` for conversions
- `Editor` class for CodeMirror integration

## Resources

### Official Documentation
- [Writing Anki Add-ons](https://addon-docs.ankiweb.net/)
- [Hooks and Filters](https://addon-docs.ankiweb.net/hooks-and-filters.html)
- [Anki Manual - Editing](https://docs.ankiweb.net/editing.html)

### Source Code
- [ankitects/anki](https://github.com/ankitects/anki)
- [markdown-input](https://github.com/TRIAEIOU/markdown-input) - Reference implementation

### Related Issues
- [#2772](https://github.com/ankitects/anki/issues/2772) - Paste image limitations
- [#3733](https://github.com/ankitects/anki/pull/3733) - Image file support
- [#3836](https://github.com/ankitects/anki/issues/3836) - Editor contenteditable issues
