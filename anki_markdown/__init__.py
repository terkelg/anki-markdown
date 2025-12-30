from pathlib import Path
from aqt import mw, gui_hooks

ADDON_DIR = Path(__file__).parent
NOTETYPE = "Anki Markdown"

def read(name: str) -> str:
    return (ADDON_DIR / name).read_text(encoding="utf-8")

def on_profile_loaded():
    sync_media()
    ensure_notetype()

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
        # Update existing templates
        m["tmpls"][0]["qfmt"] = read("templates/front.html")
        m["tmpls"][0]["afmt"] = read("templates/back.html")
        mm.save(m)
        return

    # Create new
    m = mm.new(NOTETYPE)
    mm.add_field(m, mm.new_field("Front"))
    mm.add_field(m, mm.new_field("Back"))

    t = mm.new_template("Card 1")
    t["qfmt"] = read("templates/front.html")
    t["afmt"] = read("templates/back.html")
    mm.add_template(m, t)

    mm.add(m)

gui_hooks.profile_did_open.append(on_profile_loaded)
