from pathlib import Path
import re
from aqt import mw, gui_hooks
from aqt.qt import QMessageBox
from aqt.editor import Editor
from aqt.webview import WebContent

from .shiki import store, get_config, generate_config_json
from .settings import show_settings

ADDON_DIR = Path(__file__).parent
NOTETYPE = "Anki Markdown"


def read(name: str) -> str:
    return (ADDON_DIR / name).read_text(encoding="utf-8")


def html_to_markdown(content: str) -> str:
    """Convert basic HTML tags to markdown syntax.

    Not strictly required since HTML is supported in the markdown renderer,
    but keeps stored content as clean markdown without HTML tags.
    """
    text = content

    def img_replace(m):
        src = m.group(1).replace(" ", "%20")
        return f"![]({src})"

    text = re.sub(
        r'<img\s+src="([^"]+)"[^>]*/?>', img_replace, text, flags=re.IGNORECASE
    )
    text = re.sub(
        r"<(b|strong)>(.*?)</\1>", r"**\2**", text, flags=re.DOTALL | re.IGNORECASE
    )
    text = re.sub(
        r"<(i|em)>(.*?)</\1>", r"*\2*", text, flags=re.DOTALL | re.IGNORECASE
    )
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
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
    # Download any missing language/theme files
    _, errors = store.sync(get_config())
    if errors:
        details = "\n".join(f"- {err}" for err in errors)
        QMessageBox.warning(
            mw,
            "Anki Markdown",
            "Failed to download some syntax highlighting files.\n"
            "Open the add-on settings to retry.\n\n"
            f"{details}",
        )
    # Sync all media files to collection.media
    sync_media()
    # Create/update note type with current config
    ensure_notetype()
    # Register web exports and settings action
    mw.addonManager.setWebExports(__name__, r"(web/.*|_.*)")
    mw.addonManager.setConfigAction(__name__, show_settings)


def sync_media(removed: list[str] = None):
    """Copy web assets to collection.media (force overwrite).

    Args:
        removed: Optional list of filenames that were removed and should be deleted.
    """
    media_dir = Path(mw.col.media.dir())

    # Delete removed files directly (trash_files doesn't work on _ prefixed files)
    if removed:
        for name in removed:
            media_file = media_dir / name
            if media_file.exists():
                media_file.unlink()

    # Sync current files
    files = [f for f in ADDON_DIR.glob("_*") if f.is_file()]
    mw.col.media.trash_files([f.name for f in files])
    for file in files:
        mw.col.media.add_file(str(file))


def get_template(name: str) -> str:
    """Read template and inject current config."""
    template = read(f"templates/{name}")
    config_json = generate_config_json()
    # Inject config JSON into template
    config_script = f'<script type="application/json" id="anki-md-config">{config_json}</script>'
    # Insert config script at the beginning of template
    return config_script + "\n" + template


DEFAULT_CSS = (
    "/* Uncomment to customize:\n"
    ".card {\n"
    "  --font-size: 14px;\n"
    "  --font-size-mobile: 12px;\n"
    "  --line-height: 1.5;\n"
    "  --content-max-width: 34rem;\n"
    "  --note: #2563eb;\n"
    "  --tip: #16a34a;\n"
    "  --important: #7c3aed;\n"
    "  --warning: #ca8a04;\n"
    "  --caution: #dc2626;\n"
    "}\n"
    "\n"
    ".card.night-mode {\n"
    "  --note: #318aff;\n"
    "  --tip: #19be56;\n"
    "  --important: #965bfb;\n"
    "  --warning: #dc9703;\n"
    "}\n"
    "*/"
)


def ensure_notetype():
    mm = mw.col.models
    m = mm.by_name(NOTETYPE)

    if m:
        m["tmpls"][0]["qfmt"] = get_template("front.html")
        m["tmpls"][0]["afmt"] = get_template("back.html")
        for f in m["flds"]:
            f["plainText"] = True
        mm.save(m)
        return

    m = mm.new(NOTETYPE)
    m["css"] = DEFAULT_CSS
    front = mm.new_field("Front")
    front["plainText"] = True
    mm.add_field(m, front)
    back = mm.new_field("Back")
    back["plainText"] = True
    mm.add_field(m, back)

    t = mm.new_template("Default")
    t["qfmt"] = get_template("front.html")
    t["afmt"] = get_template("back.html")
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
