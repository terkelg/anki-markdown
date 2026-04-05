"""Tests for shiki.py — pure functions and ShikiStore.

Most tests read from node_modules (offline). Tests marked @online hit esm.sh.
"""

import pytest

online = pytest.mark.online


# Pure function tests


class TestIsAliasModule:
    def test_alias(self, shiki):
        content = b'import{default as o}from"./shellscript.mjs";export{o as default};'
        assert shiki.is_alias_module(content) == "shellscript"

    def test_large_module(self, shiki):
        content = b"x" * 300
        assert shiki.is_alias_module(content) is None


class TestLangDeps:
    def test_deps(self, shiki):
        content = 'import t from"./javascript.mjs";import e from"./css.mjs";'
        assert set(shiki.lang_deps(content)) == {"javascript", "css"}

    def test_leaf(self, shiki):
        content = "var x=1;export default x;"
        assert shiki.lang_deps(content) == []


class TestRewriteLangImports:
    def test_rewrites(self, shiki):
        content = 'import t from"./javascript.mjs";import e from"./css.mjs";'
        result = shiki.rewrite_lang_imports(content)
        assert result == 'import t from"./_lang-javascript.js";import e from"./_lang-css.js";'

    def test_preserves(self, shiki):
        content = "var x=1;export default x;"
        assert shiki.rewrite_lang_imports(content) == content


# Store tests — needs_redownload (offline)


class TestNeedsRedownload:
    def test_missing(self, shiki, tmp_path):
        s = shiki.ShikiStore(tmp_path)
        assert s.needs_redownload("html") is True

    def test_broken(self, shiki, tmp_path):
        (tmp_path / "_lang-html.js").write_text('import t from"./javascript.mjs";')
        s = shiki.ShikiStore(tmp_path)
        assert s.needs_redownload("html") is True

    def test_fixed(self, shiki, tmp_path):
        (tmp_path / "_lang-html.js").write_text('import t from"./_lang-javascript.js";')
        (tmp_path / "_lang-javascript.js").write_text("var x;")
        s = shiki.ShikiStore(tmp_path)
        assert s.needs_redownload("html") is False

    def test_missing_dep(self, shiki, tmp_path):
        """Rewritten imports but dep file missing → needs redownload."""
        (tmp_path / "_lang-html.js").write_text('import t from"./_lang-javascript.js";')
        s = shiki.ShikiStore(tmp_path)
        assert s.needs_redownload("html") is True

    def test_missing_transitive_dep(self, shiki, tmp_path):
        """Direct dep exists, but transitive dep missing → needs redownload."""
        (tmp_path / "_lang-nginx.js").write_text('import t from"./_lang-lua.js";')
        (tmp_path / "_lang-lua.js").write_text('import t from"./_lang-c.js";')
        s = shiki.ShikiStore(tmp_path)
        assert s.needs_redownload("nginx") is True


# Store tests — download (offline, reads from node_modules)


class TestDownloadLang:
    def test_html(self, shiki, tmp_path):
        """Rewrites imports, auto-downloads javascript+css deps."""
        s = shiki.ShikiStore(tmp_path)
        s.download_lang("html")
        html = (tmp_path / "_lang-html.js").read_text()
        assert 'from"./javascript.mjs"' not in html
        assert 'from"./_lang-javascript.js"' in html
        assert (tmp_path / "_lang-javascript.js").exists()
        assert (tmp_path / "_lang-css.js").exists()

    def test_bash_alias(self, shiki, tmp_path):
        """Resolves alias, full grammar not stub."""
        s = shiki.ShikiStore(tmp_path)
        s.download_lang("bash")
        content = (tmp_path / "_lang-bash.js").read_text()
        assert len(content) > 200

    def test_glsl(self, shiki, tmp_path):
        """Auto-downloads c dep."""
        s = shiki.ShikiStore(tmp_path)
        s.download_lang("glsl")
        assert (tmp_path / "_lang-c.js").exists()

    def test_circular_guard(self, shiki, tmp_path):
        """Pre-populated _seen skips refetch."""
        s = shiki.ShikiStore(tmp_path)
        s.download_lang("html", _seen={"html"})
        assert not (tmp_path / "_lang-html.js").exists()


class TestSync:
    def test_sync(self, shiki, tmp_path):
        """Downloads missing, re-downloads broken, skips good."""
        s = shiki.ShikiStore(tmp_path)
        config = {
            "languages": ["python"],
            "themes": {"light": "vitesse-light", "dark": "vitesse-dark"},
        }
        downloaded, errors = s.sync(config)
        assert not errors
        assert (tmp_path / "_lang-python.js").exists()
        assert (tmp_path / "_theme-vitesse-light.js").exists()
        assert (tmp_path / "_theme-vitesse-dark.js").exists()

        # Second sync skips
        downloaded2, _ = s.sync(config)
        assert not downloaded2

        # Break a file → re-sync re-downloads it
        (tmp_path / "_lang-python.js").write_text('from"./broken.mjs";')
        downloaded3, _ = s.sync(config)
        assert "_lang-python.js" in downloaded3

    def test_dep_failure_recovery(self, shiki, monkeypatch, tmp_path):
        """Dep fails mid-download → next sync retries and recovers."""
        s = shiki.ShikiStore(tmp_path)
        config = {
            "languages": ["html"],
            "themes": {"light": "vitesse-light", "dark": "vitesse-dark"},
        }

        # Fail on javascript dep
        orig = shiki.fetch_module
        def fail_js(url):
            if "javascript.mjs" in url:
                raise ConnectionError("simulated")
            return orig(url)
        monkeypatch.setattr(shiki, "fetch_module", fail_js)

        _, errors = s.sync(config)
        assert errors
        assert (tmp_path / "_lang-html.js").exists()
        assert not (tmp_path / "_lang-javascript.js").exists()

        # Restore fetch, retry → recovers
        monkeypatch.setattr(shiki, "fetch_module", orig)
        downloaded, errors = s.sync(config)
        assert not errors
        assert "_lang-html.js" in downloaded
        assert (tmp_path / "_lang-javascript.js").exists()

    def test_transitive_dep_failure_recovery(self, shiki, monkeypatch, tmp_path):
        """Transitive dep fails mid-download → next sync retries and recovers."""
        s = shiki.ShikiStore(tmp_path)
        config = {
            "languages": ["nginx"],
            "themes": {"light": "vitesse-light", "dark": "vitesse-dark"},
        }

        # nginx -> lua -> c, fail on transitive dep c
        orig = shiki.fetch_module

        def fail_c(url):
            if "/c.mjs" in url:
                raise ConnectionError("simulated")
            return orig(url)

        monkeypatch.setattr(shiki, "fetch_module", fail_c)

        _, errors = s.sync(config)
        assert errors
        assert (tmp_path / "_lang-nginx.js").exists()
        assert (tmp_path / "_lang-lua.js").exists()
        assert not (tmp_path / "_lang-c.js").exists()

        # Restore fetch, retry -> recovers transitive dep too
        monkeypatch.setattr(shiki, "fetch_module", orig)
        downloaded, errors = s.sync(config)
        assert not errors
        assert "_lang-nginx.js" in downloaded
        assert (tmp_path / "_lang-c.js").exists()


# Cleanup tests (synthetic files, offline)


class TestCleanup:
    def test_dep_protected(self, shiki, tmp_path):
        """html configured, javascript only a dep → kept."""
        s = shiki.ShikiStore(tmp_path)
        (tmp_path / "_lang-html.js").write_text('import t from"./_lang-javascript.js";')
        (tmp_path / "_lang-javascript.js").write_text("var x;")
        config = {"languages": ["html"], "themes": {"light": "a", "dark": "b"}}
        removed = s.cleanup(config)
        assert "_lang-javascript.js" not in removed
        assert (tmp_path / "_lang-javascript.js").exists()

    def test_transitive_dep_protected(self, shiki, tmp_path):
        """Configured root keeps deps through multiple levels."""
        s = shiki.ShikiStore(tmp_path)
        (tmp_path / "_lang-html.js").write_text('import t from"./_lang-javascript.js";')
        (tmp_path / "_lang-javascript.js").write_text('import t from"./_lang-css.js";')
        (tmp_path / "_lang-css.js").write_text("var x;")
        config = {"languages": ["html"], "themes": {"light": "a", "dark": "b"}}

        removed = s.cleanup(config)
        assert not removed

    def test_unused_removed(self, shiki, tmp_path):
        """Not configured, not dep → deleted."""
        s = shiki.ShikiStore(tmp_path)
        (tmp_path / "_lang-ruby.js").write_text("var x;")
        config = {"languages": [], "themes": {"light": "a", "dark": "b"}}
        removed = s.cleanup(config)
        assert "_lang-ruby.js" in removed

    def test_configured_dep(self, shiki, tmp_path):
        """Both configured and referenced → kept."""
        s = shiki.ShikiStore(tmp_path)
        (tmp_path / "_lang-html.js").write_text('import t from"./_lang-javascript.js";')
        (tmp_path / "_lang-javascript.js").write_text("var x;")
        config = {"languages": ["html", "javascript"], "themes": {"light": "a", "dark": "b"}}
        removed = s.cleanup(config)
        assert not removed

    def test_orphan(self, shiki, tmp_path):
        """Orphaned deps are removed in the same cleanup pass."""
        s = shiki.ShikiStore(tmp_path)
        (tmp_path / "_lang-html.js").write_text('import t from"./_lang-javascript.js";')
        (tmp_path / "_lang-javascript.js").write_text("var x;")
        config = {"languages": [], "themes": {"light": "a", "dark": "b"}}

        removed = s.cleanup(config)
        assert "_lang-html.js" in removed
        assert "_lang-javascript.js" in removed

    def test_transitive_orphan(self, shiki, tmp_path):
        """Orphaned dep chains are removed in the same cleanup pass."""
        s = shiki.ShikiStore(tmp_path)
        (tmp_path / "_lang-html.js").write_text('import t from"./_lang-javascript.js";')
        (tmp_path / "_lang-javascript.js").write_text('import t from"./_lang-css.js";')
        (tmp_path / "_lang-css.js").write_text("var x;")
        config = {"languages": [], "themes": {"light": "a", "dark": "b"}}

        removed = s.cleanup(config)
        assert "_lang-html.js" in removed
        assert "_lang-javascript.js" in removed
        assert "_lang-css.js" in removed

    def test_cycle(self, shiki, tmp_path):
        """Cycles do not loop and configured members stay reachable."""
        s = shiki.ShikiStore(tmp_path)
        (tmp_path / "_lang-a.js").write_text('import t from"./_lang-b.js";')
        (tmp_path / "_lang-b.js").write_text('import t from"./_lang-a.js";')
        config = {"languages": ["a"], "themes": {"light": "a", "dark": "b"}}

        removed = s.cleanup(config)
        assert not removed

    def test_theme_removed(self, shiki, tmp_path):
        """Non-configured theme → deleted."""
        s = shiki.ShikiStore(tmp_path)
        (tmp_path / "_theme-monokai.js").write_text("var x;")
        config = {"languages": [], "themes": {"light": "vitesse-light", "dark": "vitesse-dark"}}
        removed = s.cleanup(config)
        assert "_theme-monokai.js" in removed


class TestDebug:
    def test_local_deps(self, shiki, tmp_path):
        s = shiki.ShikiStore(tmp_path)
        (tmp_path / "_lang-html.js").write_text(
            'import t from"./_lang-javascript.js";import e from"./_lang-css.js";'
        )
        assert s.local_deps("html") == ["css", "javascript"]

    def test_debug_data(self, shiki, tmp_path):
        s = shiki.ShikiStore(tmp_path)
        (tmp_path / "_lang-html.js").write_text('import t from"./_lang-javascript.js";')
        (tmp_path / "_lang-javascript.js").write_text("var x;")
        (tmp_path / "_theme-vitesse-dark.js").write_text("var x;")
        config = {
            "languages": ["html", "python"],
            "themes": {"light": "vitesse-light", "dark": "vitesse-dark"},
        }

        data = s.debug_data(config)
        assert data["roots"] == ["html", "python"]
        assert data["graph"] == {"html": ["javascript"], "javascript": []}
        assert data["miss"] == ["python"]
        assert data["deps"] == ["javascript"]
        assert data["rev"] == {"javascript": ["html"]}
        assert data["themes"] == ["vitesse-dark"]

    def test_debug_text(self, shiki, tmp_path):
        s = shiki.ShikiStore(tmp_path)
        (tmp_path / "_lang-html.js").write_text('import t from"./_lang-javascript.js";')
        (tmp_path / "_lang-javascript.js").write_text("var x;")
        (tmp_path / "_theme-vitesse-dark.js").write_text("var x;")
        config = {
            "languages": ["html", "python"],
            "themes": {"light": "vitesse-light", "dark": "vitesse-dark"},
        }

        text = s.debug_text(config)
        assert "shiki:" in text
        assert "selected languages: html, python" in text
        assert "missing selected: python" in text
        assert "installed themes: vitesse-dark" in text
        assert "html: deps=javascript; used_by=-" in text
        assert "javascript: deps=-; used_by=html" in text


# Online tests — real esm.sh downloads


@online
class TestOnlineDownload:
    def test_html(self, shiki_online, tmp_path):
        """Verify esm.sh serves same format as node_modules."""
        s = shiki_online.ShikiStore(tmp_path)
        s.download_lang("html")
        html = (tmp_path / "_lang-html.js").read_text()
        assert 'from"./javascript.mjs"' not in html
        assert 'from"./_lang-javascript.js"' in html
        assert (tmp_path / "_lang-javascript.js").exists()
        assert (tmp_path / "_lang-css.js").exists()

    def test_bash_alias(self, shiki_online, tmp_path):
        s = shiki_online.ShikiStore(tmp_path)
        s.download_lang("bash")
        assert len((tmp_path / "_lang-bash.js").read_text()) > 200

    def test_sync(self, shiki_online, tmp_path):
        s = shiki_online.ShikiStore(tmp_path)
        config = {
            "languages": ["python"],
            "themes": {"light": "vitesse-light", "dark": "vitesse-dark"},
        }
        _, errors = s.sync(config)
        assert not errors
        assert (tmp_path / "_lang-python.js").exists()
        assert (tmp_path / "_theme-vitesse-light.js").exists()
