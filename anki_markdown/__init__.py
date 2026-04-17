from pathlib import Path
import re
from aqt import mw, gui_hooks
from aqt.qt import QAction, QMessageBox
from aqt.editor import Editor
from aqt.webview import WebContent

from .shiki import store, get_config, generate_config_json
from .settings import show_settings

ADDON_DIR = Path(__file__).parent
NOTETYPE = "Anki Markdown"
NOTETYPE_CLOZE = "Anki Markdown Cloze"
NOTETYPE_TYPE_IN = "Anki Markdown Type-In"
MENU = "Anki Markdown"

MARKDOWN_NOTETYPES = (NOTETYPE, NOTETYPE_CLOZE, NOTETYPE_TYPE_IN)


def is_anki_markdown(notetype) -> bool:
    """Check if a note type is any Anki Markdown variant."""
    return notetype and notetype["name"] in MARKDOWN_NOTETYPES


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
    if not is_anki_markdown(editor.note.note_type()):
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
    # Create/update note types with current config
    ensure_notetype()
    ensure_typein_notetype()
    ensure_cloze_notetype()
    # Register web exports and settings action
    mw.addonManager.setWebExports(__name__, r"(web/.*|_.*)")
    mw.addonManager.setConfigAction(__name__, show_settings)
    add_menu()


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


def add_menu():
    """Add the settings dialog to the Tools menu once per session."""
    if getattr(mw, "_anki_md_menu", None):
        return
    menu = getattr(getattr(mw, "form", None), "menuTools", None)
    if not menu:
        return
    act = QAction(MENU, mw)
    act.triggered.connect(lambda _=False: show_settings())
    menu.addAction(act)
    mw._anki_md_menu = act


def get_template(name: str) -> str:
    """Read template and inject current config."""
    template = read(f"templates/{name}")
    config_json = generate_config_json()
    # Inject config JSON into template
    config_script = f'<script type="application/json" id="anki-md-config">{config_json}</script>'
    # Insert config script at the beginning of template
    return config_script + "\n" + template


def ensure_basic_notetype(name: str, front_template: str, back_template: str):
    mm = mw.col.models
    m = mm.by_name(name)

    if m:
        m["tmpls"][0]["qfmt"] = get_template(front_template)
        m["tmpls"][0]["afmt"] = get_template(back_template)
        for f in m["flds"]:
            f["plainText"] = True
        mm.save(m)
        return

    m = mm.new(name)
    m["css"] = DEFAULT_CSS
    front = mm.new_field("Front")
    front["plainText"] = True
    mm.add_field(m, front)
    back = mm.new_field("Back")
    back["plainText"] = True
    mm.add_field(m, back)

    t = mm.new_template("Default")
    t["qfmt"] = get_template(front_template)
    t["afmt"] = get_template(back_template)
    mm.add_template(m, t)

    mm.add(m)


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
    ensure_basic_notetype(NOTETYPE, "front.html", "back.html")


def fix_typein_fields(mm, model):
    fields = model["flds"]
    while len(fields) < 3:
        mm.add_field(model, mm.new_field(["Front", "Back", "Extra"][len(fields)]))
        fields = model["flds"]
    for i, field in enumerate(fields):
        if i < 3:
            field["name"] = ["Front", "Back", "Extra"][i]
        field["plainText"] = True


def ensure_typein_notetype():
    mm = mw.col.models
    m = mm.by_name(NOTETYPE_TYPE_IN)

    if m:
        m["tmpls"][0]["qfmt"] = get_template("typein-front.html")
        m["tmpls"][0]["afmt"] = get_template("typein-back.html")
        fix_typein_fields(mm, m)
        mm.save(m)
        return

    m = mm.new(NOTETYPE_TYPE_IN)
    m["css"] = DEFAULT_CSS
    front = mm.new_field("Front")
    front["plainText"] = True
    mm.add_field(m, front)
    back = mm.new_field("Back")
    back["plainText"] = True
    mm.add_field(m, back)
    extra = mm.new_field("Extra")
    extra["plainText"] = True
    mm.add_field(m, extra)

    t = mm.new_template("Default")
    t["qfmt"] = get_template("typein-front.html")
    t["afmt"] = get_template("typein-back.html")
    mm.add_template(m, t)

    mm.add(m)


def fix_cloze_fields(mm, model):
    fields = model["flds"]
    if not fields:
        mm.add_field(model, mm.new_field("Text"))
        fields = model["flds"]
    if len(fields) == 1:
        mm.add_field(model, mm.new_field("Extra"))
        fields = model["flds"]
    fields[0]["name"] = "Text"
    fields[1]["name"] = "Extra"
    for field in fields:
        field["plainText"] = True


def ensure_cloze_notetype():
    mm = mw.col.models
    m = mm.by_name(NOTETYPE_CLOZE)

    if m:
        m["type"] = 1
        m["tmpls"][0]["qfmt"] = get_template("cloze-front.html")
        m["tmpls"][0]["afmt"] = get_template("cloze-back.html")
        fix_cloze_fields(mm, m)
        mm.save(m)
        return

    from anki.stdmodels import StockNotetypeKind
    from anki.utils import from_json_bytes

    m = from_json_bytes(
        mw.col._backend.get_stock_notetype_legacy(StockNotetypeKind.KIND_CLOZE)
    )
    m["name"] = NOTETYPE_CLOZE
    m["css"] = DEFAULT_CSS
    m["tmpls"][0]["qfmt"] = get_template("cloze-front.html")
    m["tmpls"][0]["afmt"] = get_template("cloze-back.html")
    fix_cloze_fields(mm, m)

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
    if is_anki_markdown(editor.note.note_type()):
        editor.web.eval("window.ankiMdActivate && ankiMdActivate()")
    else:
        editor.web.eval("window.ankiMdDeactivate && ankiMdDeactivate()")


gui_hooks.profile_did_open.append(on_profile_loaded)
gui_hooks.editor_will_munge_html.append(on_munge_html)
gui_hooks.webview_will_set_content.append(on_webview_set_content)
gui_hooks.editor_did_load_note.append(on_editor_load_note)
