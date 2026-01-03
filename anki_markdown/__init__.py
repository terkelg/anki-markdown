from pathlib import Path
import re
from aqt import mw, gui_hooks
from aqt.editor import Editor
from aqt.webview import WebContent

ADDON_DIR = Path(__file__).parent
NOTETYPE = "Anki Markdown"

def read(name: str) -> str:
    return (ADDON_DIR / name).read_text(encoding="utf-8")

def html_to_markdown(html: str) -> str:
    """Convert basic HTML tags to markdown syntax.

    Not strictly required since HTML is supported in the markdown renderer,
    but keeps stored content as clean markdown without HTML tags.
    """
    text = html

    def img_replace(m):
        src = m.group(1).replace(' ', '%20')
        return f'![]({src})'
    text = re.sub(r'<img\s+src="([^"]+)"[^>]*/?>', img_replace, text, flags=re.IGNORECASE)
    text = re.sub(r'<(b|strong)>(.*?)</\1>', r'**\2**', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<(i|em)>(.*?)</\1>', r'*\2*', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    return text

def on_munge_html(txt: str, editor: Editor) -> str:
    """Convert HTML to markdown before saving."""
    if not editor.note:
        return txt
    notetype = editor.note.note_type()
    if not notetype or notetype["name"] != NOTETYPE:
        return txt
    return html_to_markdown(txt)

def on_profile_loaded():
    sync_media()
    ensure_notetype()
    mw.addonManager.setWebExports(__name__, r"(web/.*|_review\..*)")

def sync_media():
    """Copy web assets to collection.media (force overwrite)."""
    files = [f for f in ADDON_DIR.glob("_*") if f.is_file()]
    # Delete existing files first to force update
    mw.col.media.trash_files([f.name for f in files])
    for file in files:
        mw.col.media.add_file(str(file))

NOTETYPE_CSS = ".card { all: unset; }"

def ensure_notetype():
    mm = mw.col.models
    m = mm.by_name(NOTETYPE)

    if m:
        m["tmpls"][0]["qfmt"] = read("templates/front.html")
        m["tmpls"][0]["afmt"] = read("templates/back.html")
        m["css"] = NOTETYPE_CSS
        mm.save(m)
        return

    m = mm.new(NOTETYPE)
    m["css"] = NOTETYPE_CSS
    front = mm.new_field("Front")
    mm.add_field(m, front)
    back = mm.new_field("Back")
    mm.add_field(m, back)

    t = mm.new_template("Default")
    t["qfmt"] = read("templates/front.html")
    t["afmt"] = read("templates/back.html")
    mm.add_template(m, t)

    mm.add(m)

def on_webview_set_content(content: WebContent, context):
    """Inject editor JS/CSS."""
    if isinstance(context, Editor):
        addon = mw.addonManager.addonFromModule(__name__)
        content.js.append(f"/_addons/{addon}/web/editor.js")
        content.css.append(f"/_addons/{addon}/web/editor.css")

def on_editor_load_note(editor: Editor):
    """Notify JS when Anki Markdown note is loaded."""
    if not editor.note:
        return
    notetype = editor.note.note_type()
    if notetype and notetype["name"] == NOTETYPE:
        editor.web.eval("window.ankiMdActivate && ankiMdActivate()")
    else:
        editor.web.eval("window.ankiMdDeactivate && ankiMdDeactivate()")

gui_hooks.profile_did_open.append(on_profile_loaded)
gui_hooks.editor_will_munge_html.append(on_munge_html)
gui_hooks.webview_will_set_content.append(on_webview_set_content)
gui_hooks.editor_did_load_note.append(on_editor_load_note)
