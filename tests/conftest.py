import importlib.util
import re
from pathlib import Path

import pytest


def pytest_configure(config):
    config.addinivalue_line("markers", "online: tests that hit esm.sh")
    config.addinivalue_line("markers", "offline: tests that read from node_modules")


def pytest_collection_modifyitems(items):
    for item in items:
        if "online" not in item.keywords:
            item.add_marker(pytest.mark.offline)

ROOT = Path(__file__).parent.parent
LANGS_DIR = ROOT / "node_modules" / "@shikijs" / "langs" / "dist"
THEMES_DIR = ROOT / "node_modules" / "@shikijs" / "themes" / "dist"


@pytest.fixture
def shiki(monkeypatch):
    """Load shiki module via importlib, patched to read from node_modules."""
    path = ROOT / "anki_markdown" / "shiki.py"
    spec = importlib.util.spec_from_file_location("shiki", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    def local_fetch(url):
        match = re.search(r"/(langs|themes)@[^/]+/es2022/(.+)\.mjs$", url)
        if not match:
            raise ValueError(f"unexpected URL: {url}")
        root = LANGS_DIR if match.group(1) == "langs" else THEMES_DIR
        return (root / f"{match.group(2)}.mjs").read_bytes()

    monkeypatch.setattr(mod, "fetch_module", local_fetch)
    return mod


@pytest.fixture
def shiki_online():
    """Load shiki module with real network calls (no patching)."""
    path = ROOT / "anki_markdown" / "shiki.py"
    spec = importlib.util.spec_from_file_location("shiki", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
