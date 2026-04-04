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
    def __init__(self, model=None):
        self.model = model
        self.saved = []
        self.added = []

    def by_name(self, _name):
        return self.model

    def save(self, model):
        self.saved.append(model)

    def new(self, name):
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
        self.model = model
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

    media = FakeMedia(tmp_path / "media")
    media.path.mkdir()
    models = FakeModels()
    addon_manager = FakeAddonManager()
    mw = types.SimpleNamespace(
        col=types.SimpleNamespace(media=media, models=models),
        addonManager=addon_manager,
    )
    box = FakeMessageBox()
    hooks = FakeHooks()

    aqt = types.ModuleType("aqt")
    aqt.mw = mw
    aqt.gui_hooks = hooks

    qt = types.ModuleType("aqt.qt")
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

    for name in [
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


class TestEnsureNotetype:
    def test_updates_existing_model(self, addon):
        model = {
            "tmpls": [{"qfmt": "old-front", "afmt": "old-back"}],
            "flds": [{"name": "Front"}, {"name": "Back", "plainText": False}],
        }
        addon.models.model = model

        addon.mod.ensure_notetype()

        assert addon.models.saved == [model]
        assert model["tmpls"][0]["qfmt"].endswith("<div>front</div>")
        assert model["tmpls"][0]["afmt"].endswith("<div>back</div>")
        assert all(field["plainText"] is True for field in model["flds"])

    def test_creates_missing_model(self, addon):
        addon.mod.ensure_notetype()

        assert len(addon.models.added) == 1
        model = addon.models.added[0]
        assert model["name"] == "Anki Markdown"
        assert [field["name"] for field in model["flds"]] == ["Front", "Back"]
        assert all(field["plainText"] is True for field in model["flds"])
        assert model["tmpls"][0]["name"] == "Default"
        assert model["tmpls"][0]["qfmt"].endswith("<div>front</div>")
        assert model["tmpls"][0]["afmt"].endswith("<div>back</div>")
        assert model["css"] == addon.mod.DEFAULT_CSS


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
