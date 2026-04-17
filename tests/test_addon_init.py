import importlib.util
import json
import sys
import types
from pathlib import Path

import pytest

ROOT = Path(__file__).parent.parent
PKG = ROOT / "anki_markdown"


class FakeHooks:
    def __init__(self):
        self.profile_did_open = []
        self.editor_will_munge_html = []
        self.webview_will_set_content = []
        self.editor_did_load_note = []


class FakeMessageBox:
    def __init__(self):
        self.calls = []

    def warning(self, *args):
        self.calls.append(("warning", args))


class FakeAddonManager:
    def __init__(self):
        self.web_exports = []
        self.actions = []

    def setWebExports(self, mod, pattern):
        self.web_exports.append((mod, pattern))

    def setConfigAction(self, mod, fn):
        self.actions.append((mod, fn))

    def addonFromModule(self, mod):
        return mod


class FakeSignal:
    def __init__(self):
        self.slots = []

    def connect(self, fn):
        self.slots.append(fn)


class FakeAction:
    def __init__(self, text, parent=None):
        self.parent = parent
        self._text = text
        self.triggered = FakeSignal()

    def text(self):
        return self._text


class FakeMenu:
    def __init__(self):
        self.added = []

    def addAction(self, act):
        self.added.append(act)


class FakeMedia:
    def __init__(self, path: Path):
        self.path = path
        self.trashed = []
        self.added = []

    def dir(self):
        return str(self.path)

    def trash_files(self, files):
        self.trashed.append(list(files))

    def add_file(self, path):
        self.added.append(path)


class FakeModels:
    def __init__(self):
        self.models = {}
        self.saved = []
        self.added = []
        self.newed = []

    def by_name(self, name):
        return self.models.get(name)

    def save(self, model):
        self.saved.append(model)

    def new(self, name):
        self.newed.append(name)
        return {"name": name, "flds": [], "tmpls": []}

    def new_field(self, name):
        return {"name": name}

    def add_field(self, model, field):
        model["flds"].append(field)

    def new_template(self, name):
        return {"name": name}

    def add_template(self, model, template):
        model["tmpls"].append(template)

    def add(self, model):
        self.models[model["name"]] = model
        self.added.append(model)


class FakeWeb:
    def __init__(self):
        self.calls = []

    def eval(self, code):
        self.calls.append(code)


class FakeNote:
    def __init__(self, name):
        self.name = name

    def note_type(self):
        return None if self.name is None else {"name": self.name}


class FakeEditor:
    def __init__(self, note=None):
        self.note = note
        self.web = FakeWeb()


class FakeWebContent:
    def __init__(self):
        self.js = []
        self.css = []


class FakeBackend:
    def __init__(self):
        self.calls = []

    def get_stock_notetype_legacy(self, kind):
        self.calls.append(kind)
        return json.dumps(
            {
                "name": "Cloze",
                "type": 1,
                "flds": [{"name": "Text"}, {"name": "Back Extra"}],
                "tmpls": [{"name": "Cloze", "qfmt": "stock-front", "afmt": "stock-back"}],
            }
        )


@pytest.fixture
def addon(monkeypatch, tmp_path):
    cfg = {
        "languages": ["python"],
        "themes": {"light": "vitesse-light", "dark": "vitesse-dark"},
        "cardless": False,
    }
    cfg_json = json.dumps(cfg, separators=(",", ":"))

    tpl = tmp_path / "templates"
    tpl.mkdir()
    (tpl / "front.html").write_text("<div>front</div>", encoding="utf-8")
    (tpl / "back.html").write_text("<div>back</div>", encoding="utf-8")
    (tpl / "typein-front.html").write_text("<div>typein-front</div>", encoding="utf-8")
    (tpl / "typein-back.html").write_text("<div>typein-back</div>", encoding="utf-8")
    (tpl / "cloze-front.html").write_text("<div>cloze-front</div>", encoding="utf-8")
    (tpl / "cloze-back.html").write_text("<div>cloze-back</div>", encoding="utf-8")

    media = FakeMedia(tmp_path / "media")
    media.path.mkdir()
    models = FakeModels()
    backend = FakeBackend()
    addon_manager = FakeAddonManager()
    menu = FakeMenu()
    mw = types.SimpleNamespace(
        col=types.SimpleNamespace(media=media, models=models, _backend=backend),
        addonManager=addon_manager,
        form=types.SimpleNamespace(menuTools=menu),
    )
    box = FakeMessageBox()
    hooks = FakeHooks()

    aqt = types.ModuleType("aqt")
    aqt.mw = mw
    aqt.gui_hooks = hooks

    qt = types.ModuleType("aqt.qt")
    qt.QAction = FakeAction
    qt.QMessageBox = box

    editor = types.ModuleType("aqt.editor")
    editor.Editor = FakeEditor

    webview = types.ModuleType("aqt.webview")
    webview.WebContent = FakeWebContent

    shiki = types.ModuleType("anki_markdown.shiki")
    shiki.store = types.SimpleNamespace(sync=lambda _cfg: ([], []))
    shiki.get_config = lambda: cfg
    shiki.generate_config_json = lambda: cfg_json

    settings = types.ModuleType("anki_markdown.settings")
    settings.show_settings = lambda: None

    anki = types.ModuleType("anki")
    stdmodels = types.ModuleType("anki.stdmodels")
    stdmodels.StockNotetypeKind = types.SimpleNamespace(KIND_CLOZE="cloze")
    utils = types.ModuleType("anki.utils")
    utils.from_json_bytes = json.loads

    for name in [
        "anki",
        "anki.stdmodels",
        "anki.utils",
        "anki_markdown",
        "anki_markdown.shiki",
        "anki_markdown.settings",
        "aqt",
        "aqt.qt",
        "aqt.editor",
        "aqt.webview",
    ]:
        sys.modules.pop(name, None)

    monkeypatch.setitem(sys.modules, "aqt", aqt)
    monkeypatch.setitem(sys.modules, "aqt.qt", qt)
    monkeypatch.setitem(sys.modules, "aqt.editor", editor)
    monkeypatch.setitem(sys.modules, "aqt.webview", webview)
    monkeypatch.setitem(sys.modules, "anki", anki)
    monkeypatch.setitem(sys.modules, "anki.stdmodels", stdmodels)
    monkeypatch.setitem(sys.modules, "anki.utils", utils)
    monkeypatch.setitem(sys.modules, "anki_markdown.shiki", shiki)
    monkeypatch.setitem(sys.modules, "anki_markdown.settings", settings)

    spec = importlib.util.spec_from_file_location(
        "anki_markdown",
        PKG / "__init__.py",
        submodule_search_locations=[str(PKG)],
    )
    mod = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, "anki_markdown", mod)
    spec.loader.exec_module(mod)

    monkeypatch.setattr(mod, "ADDON_DIR", tmp_path)

    return types.SimpleNamespace(
        mod=mod,
        cfg=cfg,
        box=box,
        mw=mw,
        models=models,
        media=media,
        hooks=hooks,
        addon_manager=addon_manager,
        backend=backend,
        menu=menu,
    )


class TestHtmlToMarkdown:
    def test_converts_basic_html(self, addon):
        result = addon.mod.html_to_markdown(
            '<IMG src="foo bar.png"><STRONG>x</STRONG><em>y</em><br>z',
        )

        assert result == "![](foo%20bar.png)**x***y*\nz"


class TestOnMungeHtml:
    def test_converts_only_anki_markdown_notes(self, addon):
        txt = "<strong>x</strong>"

        assert addon.mod.on_munge_html(txt, FakeEditor()) == txt
        assert addon.mod.on_munge_html(txt, FakeEditor(FakeNote(None))) == txt
        assert addon.mod.on_munge_html(txt, FakeEditor(FakeNote("Basic"))) == txt
        assert addon.mod.on_munge_html(txt, FakeEditor(FakeNote("Anki Markdown"))) == "**x**"
        assert addon.mod.on_munge_html(txt, FakeEditor(FakeNote("Anki Markdown Type-In"))) == "**x**"
        assert addon.mod.on_munge_html(txt, FakeEditor(FakeNote("Anki Markdown Cloze"))) == "**x**"


class TestEnsureNotetype:
    def test_updates_existing_model(self, addon):
        model = {
            "tmpls": [{"qfmt": "old-front", "afmt": "old-back"}],
            "flds": [{"name": "Front"}, {"name": "Back", "plainText": False}],
        }
        addon.models.models["Anki Markdown"] = model

        addon.mod.ensure_basic_notetype()

        assert addon.models.saved == [model]
        assert model["tmpls"][0]["qfmt"].endswith("<div>front</div>")
        assert model["tmpls"][0]["afmt"].endswith("<div>back</div>")
        assert all(field["plainText"] is True for field in model["flds"])

    def test_creates_missing_model(self, addon):
        addon.mod.ensure_basic_notetype()

        assert len(addon.models.added) == 1
        model = addon.models.added[0]
        assert model["name"] == "Anki Markdown"
        assert [field["name"] for field in model["flds"]] == ["Front", "Back"]
        assert all(field["plainText"] is True for field in model["flds"])
        assert model["tmpls"][0]["name"] == "Default"
        assert model["tmpls"][0]["qfmt"].endswith("<div>front</div>")
        assert model["tmpls"][0]["afmt"].endswith("<div>back</div>")
        assert model["css"] == addon.mod.DEFAULT_CSS


class TestEnsureTypeinNotetype:
    def test_creates_typein_model(self, addon):
        addon.mod.ensure_typein_notetype()

        assert len(addon.models.added) == 1
        model = addon.models.added[0]
        assert model["name"] == "Anki Markdown Type-In"
        assert [field["name"] for field in model["flds"]] == ["Front", "Back", "Extra"]
        assert all(field["plainText"] is True for field in model["flds"])
        assert model["tmpls"][0]["name"] == "Default"
        assert model["tmpls"][0]["qfmt"].endswith("<div>typein-front</div>")
        assert model["tmpls"][0]["afmt"].endswith("<div>typein-back</div>")
        assert model["css"] == addon.mod.DEFAULT_CSS

    def test_updates_existing_typein_model(self, addon):
        model = {
            "tmpls": [{"qfmt": "old-front", "afmt": "old-back"}],
            "flds": [{"name": "Front", "plainText": False}, {"name": "Back", "plainText": False}],
        }
        addon.models.models["Anki Markdown Type-In"] = model

        addon.mod.ensure_typein_notetype()

        assert addon.models.saved == [model]
        assert model["tmpls"][0]["qfmt"].endswith("<div>typein-front</div>")
        assert model["tmpls"][0]["afmt"].endswith("<div>typein-back</div>")
        assert [field["name"] for field in model["flds"]] == ["Front", "Back", "Extra"]
        assert all(field["plainText"] is True for field in model["flds"])


class TestEnsureClozeNotetype:
    def test_creates_cloze_model(self, addon):
        addon.mod.ensure_cloze_notetype()

        assert len(addon.models.added) == 1
        model = addon.models.added[0]
        assert model["name"] == "Anki Markdown Cloze"
        assert model["type"] == 1
        assert [f["name"] for f in model["flds"]] == ["Text", "Extra"]
        assert all(f["plainText"] is True for f in model["flds"])
        assert model["tmpls"][0]["name"] == "Cloze"
        assert model["tmpls"][0]["qfmt"].endswith("<div>cloze-front</div>")
        assert model["tmpls"][0]["afmt"].endswith("<div>cloze-back</div>")
        assert model["css"] == addon.mod.DEFAULT_CSS
        assert addon.backend.calls == ["cloze"]
        assert "Anki Markdown Cloze" not in addon.models.newed

    def test_updates_existing_cloze_model(self, addon):
        model = {
            "type": 1,
            "tmpls": [{"qfmt": "old", "afmt": "old"}],
            "flds": [{"name": "Texte"}, {"name": "Rückseite Extra", "plainText": False}],
        }
        addon.models.models["Anki Markdown Cloze"] = model

        addon.mod.ensure_cloze_notetype()

        assert addon.models.saved == [model]
        assert model["type"] == 1
        assert model["tmpls"][0]["qfmt"].endswith("<div>cloze-front</div>")
        assert model["tmpls"][0]["afmt"].endswith("<div>cloze-back</div>")
        assert [f["name"] for f in model["flds"]] == ["Text", "Extra"]
        assert all(f["plainText"] is True for f in model["flds"])

    def test_restores_missing_extra_field(self, addon):
        model = {
            "type": 1,
            "tmpls": [{"qfmt": "old", "afmt": "old"}],
            "flds": [{"name": "Texte", "plainText": False}],
        }
        addon.models.models["Anki Markdown Cloze"] = model

        addon.mod.ensure_cloze_notetype()

        assert addon.models.saved == [model]
        assert model["type"] == 1
        assert model["tmpls"][0]["qfmt"].endswith("<div>cloze-front</div>")
        assert model["tmpls"][0]["afmt"].endswith("<div>cloze-back</div>")
        assert [f["name"] for f in model["flds"]] == ["Text", "Extra"]
        assert all(f["plainText"] is True for f in model["flds"])


class TestSyncMedia:
    def test_deletes_removed_and_syncs_current_files(self, addon):
        (addon.mod.ADDON_DIR / "_review.js").write_text("x", encoding="utf-8")
        (addon.mod.ADDON_DIR / "_review.css").write_text("y", encoding="utf-8")
        removed = addon.media.path / "_old.js"
        removed.write_text("gone", encoding="utf-8")

        addon.mod.sync_media(["_old.js"])

        assert not removed.exists()
        assert set(addon.media.trashed[0]) == {"_review.js", "_review.css"}
        assert {Path(path).name for path in addon.media.added} == {
            "_review.js",
            "_review.css",
        }


class TestProfileLoaded:
    def test_adds_tools_menu_once(self, addon):
        addon.mod.on_profile_loaded()
        addon.mod.on_profile_loaded()

        assert [act.text() for act in addon.menu.added] == ["Anki Markdown"]
