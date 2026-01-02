from pathlib import Path
from aqt import mw, gui_hooks
from aqt.editor import Editor
from aqt.webview import WebContent

ADDON_DIR = Path(__file__).parent
NOTETYPE = "Anki Markdown"

def read(name: str) -> str:
    return (ADDON_DIR / name).read_text(encoding="utf-8")

def on_profile_loaded():
    sync_media()
    ensure_notetype()
    mw.addonManager.setWebExports(__name__, r"(web/.*|_review\..*)")

def on_webview_content(web_content: WebContent, context) -> None:
    """Inject our JS/CSS into the editor."""
    if not isinstance(context, Editor):
        return

    addon = mw.addonManager.addonFromModule(__name__)
    web_content.js.append(f"/_addons/{addon}/web/editor.js")
    web_content.css.append(f"/_addons/{addon}/web/editor.css")

def on_editor_load_note(editor: Editor) -> None:
    """Notify JS when Anki Markdown note is loaded."""
    if editor.note is None:
        return

    notetype = editor.note.note_type()
    if notetype and notetype["name"] == NOTETYPE:
        editor.web.eval("window.ankiMdActivate && ankiMdActivate()")
    else:
        editor.web.eval("window.ankiMdDeactivate && ankiMdDeactivate()")

def sync_media():
    """Copy web assets to collection.media."""
    for file in ADDON_DIR.glob("_*"):
        if file.is_file():
            mw.col.media.trash_files([file.name])
            mw.col.media.add_file(str(file))

def ensure_notetype():
    mm = mw.col.models
    m = mm.by_name(NOTETYPE)

    if m:
        m["tmpls"][0]["qfmt"] = read("templates/front.html")
        m["tmpls"][0]["afmt"] = read("templates/back.html")
        # Ensure fields use plain text mode
        for field in m["flds"]:
            field["plainText"] = True
        mm.save(m)
        return

    m = mm.new(NOTETYPE)
    front = mm.new_field("Front")
    front["plainText"] = True
    mm.add_field(m, front)
    back = mm.new_field("Back")
    back["plainText"] = True
    mm.add_field(m, back)

    t = mm.new_template("Card 1")
    t["qfmt"] = read("templates/front.html")
    t["afmt"] = read("templates/back.html")
    mm.add_template(m, t)

    mm.add(m)

gui_hooks.profile_did_open.append(on_profile_loaded)
gui_hooks.webview_will_set_content.append(on_webview_content)
gui_hooks.editor_did_load_note.append(on_editor_load_note)
