import importlib.util
import json
import sys
import types
from pathlib import Path
from unittest.mock import MagicMock

import pytest

ROOT = Path(__file__).parent.parent
PKG = ROOT / "anki_markdown"


class FakeHooks:
    def __init__(self):
        self.profile_did_open = []
        self.editor_will_munge_html = []
        self.webview_will_set_content = []
        self.editor_did_load_note = []
        self.webview_did_receive_js_message = []
        self.editor_will_show_context_menu = []


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
    qt.QClipboard = types.SimpleNamespace(Mode=types.SimpleNamespace(Clipboard=0))
    qt.QWebEnginePage = types.SimpleNamespace(WebAction=types.SimpleNamespace(Paste=1))

    editor = types.ModuleType("aqt.editor")
    editor.Editor = FakeEditor
    editor.pics = ("png", "jpg", "svg")

    qt_utils = types.ModuleType("aqt.utils")
    qt_utils.tr = types.SimpleNamespace(editing_paste=lambda: "Paste")

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
        "aqt.utils",
        "aqt.webview",
    ]:
        sys.modules.pop(name, None)

    monkeypatch.setitem(sys.modules, "aqt", aqt)
    monkeypatch.setitem(sys.modules, "aqt.qt", qt)
    monkeypatch.setitem(sys.modules, "aqt.editor", editor)
    monkeypatch.setitem(sys.modules, "aqt.utils", qt_utils)
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

        assert result == "![](foo%20bar.png)**x***y*<br>z"

    def test_preserves_image_attributes(self, addon):
        html = '<img alt="diagram" width="300" src="diagram.png">'
        assert addon.mod.html_to_markdown(html) == html


class TestOnMungeHtml:
    @pytest.mark.parametrize("name", ["Anki Markdown", "Anki Markdown Cloze"])
    @pytest.mark.parametrize("br", ["<br>", "<br/>", "<br />", "<BR>"])
    def test_preserves_line_breaks_in_markdown(self, addon, name, br):
        text = (
            "| Kind | Details |\n| --- | --- |\n"
            f"| Strong | First{br}Second |\n"
            f"| Weak | Intro{br}1. First{br}2. Second |\n\n"
            f"Use `{br}` for a line break.\n\n"
            f"```html\n{br}\n```\n\n"
            "- One\n- Two\n\nLast paragraph."
        )

        assert addon.mod.on_munge_html(text, FakeEditor(FakeNote(name))) == text

    def test_converts_only_anki_markdown_notes(self, addon):
        txt = "<strong>x</strong>"

        assert addon.mod.on_munge_html(txt, FakeEditor()) == txt
        assert addon.mod.on_munge_html(txt, FakeEditor(FakeNote(None))) == txt
        assert addon.mod.on_munge_html(txt, FakeEditor(FakeNote("Basic"))) == txt
        assert addon.mod.on_munge_html(txt, FakeEditor(FakeNote("Anki Markdown"))) == "**x**"
        assert addon.mod.on_munge_html(txt, FakeEditor(FakeNote("Anki Markdown Cloze"))) == "**x**"


class TestEnsureNotetype:
    @pytest.mark.parametrize(
        "name,expected",
        [
            ("Default", "Anki Markdown"),
            ("Anki Markdown", "Anki Markdown"),
            ("My card", "My card"),
        ],
    )
    def test_updates_existing_model(self, addon, name, expected):
        template = {"name": name, "ord": 0, "qfmt": "old-front", "afmt": "old-back"}
        reverse = {"name": "Reverse", "ord": 1, "qfmt": "reverse-front", "afmt": "reverse-back"}
        model = {
            "tmpls": [template, reverse.copy()],
            "flds": [{"name": "Front"}, {"name": "Back", "plainText": False}],
        }
        addon.models.models["Anki Markdown"] = model

        addon.mod.ensure_notetype()

        assert addon.models.saved == [model]
        assert addon.models.added == []
        assert len(model["tmpls"]) == 2
        assert model["tmpls"][0] is template
        assert template["name"] == expected
        assert template["ord"] == 0
        assert model["tmpls"][1] == reverse
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
        assert model["tmpls"][0]["name"] == "Anki Markdown"
        assert model["tmpls"][0]["qfmt"].endswith("<div>front</div>")
        assert model["tmpls"][0]["afmt"].endswith("<div>back</div>")
        assert model["css"] == addon.mod.DEFAULT_CSS


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


@pytest.fixture
def context(addon):
    editor = FakeEditor(FakeNote("Anki Markdown"))
    editor.mw = MagicMock()
    editor.web = MagicMock()
    editor.web._wantsExtendedPaste.return_value = True
    editor.web._processMime.return_value = ('<img src="native%20name.png">', True)
    mime = editor.mw.app.clipboard().mimeData.return_value
    mime.hasHtml.return_value = False
    mime.hasUrls.return_value = False
    mime.hasImage.return_value = True
    return editor, mime


@pytest.mark.parametrize("name", ["Anki Markdown", "Anki Markdown Cloze"])
def test_image_uses_native_media_processor(addon, context, name):
    editor, mime = context
    editor.note.name = name
    assert addon.mod.on_paste((False, None), "anki-markdown:paste", editor) == (
        True,
        "![](native%20name.png)",
    )
    editor.web._processMime.assert_called_once_with(mime, True)


@pytest.mark.parametrize(
    "path,local,accepted",
    [
        ("/tmp/image.PNG", True, True),
        ("/tmp/file.pdf", True, False),
        ("https://example.com/image.png", False, False),
    ],
)
def test_only_local_image_files_are_imported(addon, context, path, local, accepted):
    editor, mime = context
    mime.hasImage.return_value = False
    mime.hasUrls.return_value = True
    url = MagicMock()
    url.isLocalFile.return_value = local
    url.toLocalFile.return_value = path
    mime.urls.return_value = [url]
    result = addon.mod.on_paste((False, None), "anki-markdown:paste", editor)
    assert bool(result[1]) == accepted
    assert editor.web._processMime.called == accepted


@pytest.mark.parametrize("reason", ["html", "text", "unsupported_note"])
def test_other_clipboard_routes_do_not_import_media(addon, context, reason):
    editor, mime = context
    if reason == "html":
        mime.hasHtml.return_value = True
    elif reason == "text":
        mime.hasImage.return_value = False
    elif reason == "unsupported_note":
        editor.note.name = "Basic"
    assert addon.mod.on_paste((False, None), "anki-markdown:paste", editor) == (True, None)
    editor.web._processMime.assert_not_called()


def test_unrelated_or_already_handled_commands_pass_through(addon, context):
    editor, _ = context
    assert addon.mod.on_paste((False, None), "paste", editor) == (False, None)
    assert addon.mod.on_paste((True, "other"), "anki-markdown:paste", editor) == (True, "other")
    editor.web._processMime.assert_not_called()


def test_html_returned_by_another_mime_hook_is_not_inserted(addon, context):
    editor, _ = context
    editor.web._processMime.return_value = ('<b style="color:red">html</b>', False)
    assert addon.mod.on_paste((False, None), "anki-markdown:paste", editor) == (True, None)


@pytest.mark.parametrize(
    "name,connected",
    [("Anki Markdown", True), ("Anki Markdown Cloze", True), ("Basic", True), ("Anki Markdown", False)],
)
def test_menu_routes_only_native_markdown_paste_to_webengine(addon, context, name, connected):
    editor, _ = context
    editor.note.name = name
    web = editor.web
    web.editor = editor
    menu = MagicMock()
    copy, paste = MagicMock(), MagicMock()
    copy.text.return_value = "Copy"
    paste.text.return_value = "Paste"
    if not connected:
        paste.triggered.disconnect.side_effect = TypeError("slot is not connected")
    menu.actions.return_value = [copy, paste]
    addon.mod.on_editor_menu(web, menu)
    copy.triggered.disconnect.assert_not_called()
    if name == "Basic":
        paste.triggered.disconnect.assert_not_called()
    else:
        paste.triggered.disconnect.assert_called_once_with(web.onPaste)
    if name == "Basic" or not connected:
        paste.triggered.connect.assert_not_called()
        web.triggerPageAction.assert_not_called()
        return
    callback = paste.triggered.connect.call_args.args[0]
    callback(False)
    web.triggerPageAction.assert_called_once_with(addon.mod.QWebEnginePage.WebAction.Paste)
