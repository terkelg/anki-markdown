"""Shiki language and theme management for Anki Markdown.

Downloads language grammars and themes from esm.sh and manages them
in collection.media for mobile sync.
"""

from pathlib import Path
import urllib.request
import ssl
import json
import re

ADDON_DIR = Path(__file__).parent
ESM_BASE = "https://esm.sh/@shikijs"

_DATA = json.loads((ADDON_DIR / "shiki-data.json").read_text(encoding="utf-8"))
SHIKI_VERSION = _DATA["version"]
AVAILABLE_LANGS = _DATA["languages"]
AVAILABLE_THEMES = _DATA["themes"]


def _load_default_config() -> dict:
    """Load addon defaults from config.json, with safe fallbacks."""
    try:
        raw = json.loads((ADDON_DIR / "config.json").read_text(encoding="utf-8"))
    except Exception:
        raw = {}

    langs = [
        lang
        for lang in raw.get("languages", [])
        if isinstance(lang, str) and lang in AVAILABLE_LANGS
    ]

    raw_themes = raw.get("themes", {}) if isinstance(raw.get("themes"), dict) else {}
    light = raw_themes.get("light")
    dark = raw_themes.get("dark")

    if light not in AVAILABLE_THEMES:
        light = AVAILABLE_THEMES[0]
    if dark not in AVAILABLE_THEMES:
        dark = light

    return {
        "languages": langs,
        "themes": {"light": light, "dark": dark},
        "cardless": bool(raw.get("cardless", False)),
    }


DEFAULT_CONFIG = _load_default_config()


# Pure functions

_IMPORT_RE = re.compile(r"""from\s*["']\./([^"'.]+)\.mjs["']""")
_LOCAL_RE = re.compile(r'from"\.\/_lang-([^.]+)\.js"')

def esm_url(kind: str, name: str, version: str) -> str:
    """Generate esm.sh URL for a language or theme module."""
    pkg = "langs" if kind == "lang" else "themes"
    return f"{ESM_BASE}/{pkg}@{version}/es2022/{name}.mjs"


def is_alias_module(content: bytes) -> str | None:
    """Check if module is an alias (re-export from another module).
    Returns the canonical name if it's an alias, None otherwise.
    """
    text = content.decode("utf-8")
    if len(text) < 200:
        match = _IMPORT_RE.search(text)
        if match:
            return match.group(1)
    return None


def lang_deps(content: str) -> list[str]:
    """Extract language dependency names from module content."""
    return _IMPORT_RE.findall(content)


def rewrite_lang_imports(content: str) -> str:
    """Rewrite relative .mjs imports to local _lang-*.js paths."""
    return _IMPORT_RE.sub(
        lambda m: f'from"./_lang-{m.group(1)}.js"',
        content,
    )


# I/O

def fetch_module(url: str) -> bytes:
    """Fetch module content from esm.sh."""
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers={"User-Agent": "AnkiMarkdown/1.0"})
    with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
        return resp.read()


# Store

class ShikiStore:
    def __init__(self, dir: Path, version: str = SHIKI_VERSION):
        self.dir = dir
        self.version = version

    def download_lang(self, name: str, _seen: set[str] | None = None):
        """Download a language grammar, resolving aliases and deps."""
        if _seen is None:
            _seen = set()
        if name in _seen:
            return
        _seen.add(name)

        raw = fetch_module(esm_url("lang", name, self.version))

        canonical = is_alias_module(raw)
        if canonical:
            raw = fetch_module(esm_url("lang", canonical, self.version))

        text = raw.decode("utf-8")
        deps = lang_deps(text)
        text = rewrite_lang_imports(text)

        (self.dir / f"_lang-{name}.js").write_text(text, encoding="utf-8")

        for dep in deps:
            self.download_lang(dep, _seen)

    def download_theme(self, name: str):
        """Download a theme and save to store directory."""
        raw = fetch_module(esm_url("theme", name, self.version))
        (self.dir / f"_theme-{name}.js").write_bytes(raw)

    def needs_redownload(self, name: str) -> bool:
        """Check if a language file is missing, broken, or has missing deps at any depth."""
        stack = [name]
        seen = set()

        while stack:
            lang = stack.pop()
            if lang in seen:
                continue
            seen.add(lang)

            path = self.dir / f"_lang-{lang}.js"
            if not path.exists():
                return True

            text = path.read_text(encoding="utf-8")
            if _IMPORT_RE.search(text):
                return True

            stack.extend(_LOCAL_RE.findall(text))

        return False

    def local_langs(self) -> set[str]:
        """Get set of language names that exist locally."""
        return {f.stem.removeprefix("_lang-") for f in self.dir.glob("_lang-*.js")}

    def local_themes(self) -> set[str]:
        """Get set of theme names that exist locally."""
        return {f.stem.removeprefix("_theme-") for f in self.dir.glob("_theme-*.js")}

    def collect_deps(self) -> set[str]:
        """Collect all dependency names referenced by local lang files."""
        deps = set()
        for f in self.dir.glob("_lang-*.js"):
            text = f.read_text(encoding="utf-8")
            deps.update(_LOCAL_RE.findall(text))
        return deps

    def cleanup(self, config: dict) -> list[str]:
        """Remove unused language/theme files. Returns removed filenames."""
        removed = []
        keep = set(config.get("languages", [])) | self.collect_deps()
        themes = {config["themes"]["light"], config["themes"]["dark"]}

        for f in self.dir.glob("_lang-*.js"):
            name = f.stem.removeprefix("_lang-")
            if name not in keep:
                f.unlink()
                removed.append(f.name)

        for f in self.dir.glob("_theme-*.js"):
            name = f.stem.removeprefix("_theme-")
            if name not in themes:
                f.unlink()
                removed.append(f.name)

        return removed

    def sync(self, config: dict) -> tuple[list[str], list[str]]:
        """Download missing/broken languages and themes.

        Returns (downloaded, errors) lists.
        """
        downloaded = []
        errors = []

        for lang in config.get("languages", []):
            if self.needs_redownload(lang):
                try:
                    self.download_lang(lang)
                    downloaded.append(f"_lang-{lang}.js")
                except Exception as e:
                    errors.append(f"Failed to download {lang}: {e}")

        for theme in [config["themes"]["light"], config["themes"]["dark"]]:
            if not (self.dir / f"_theme-{theme}.js").exists():
                try:
                    self.download_theme(theme)
                    downloaded.append(f"_theme-{theme}.js")
                except Exception as e:
                    errors.append(f"Failed to download theme {theme}: {e}")

        return downloaded, errors


# Default instance
store = ShikiStore(ADDON_DIR)


# Anki glue (lazy-import aqt)

def _normalize_config(config: dict | None) -> dict:
    """Return a sanitized config with defaults filled in."""
    if not isinstance(config, dict):
        config = {}

    raw_langs = config.get("languages", [])
    langs: list[str] = []
    seen = set()
    if isinstance(raw_langs, list):
        for lang in raw_langs:
            if not isinstance(lang, str):
                continue
            name = lang.strip()
            if not name or name not in AVAILABLE_LANGS or name in seen:
                continue
            seen.add(name)
            langs.append(name)
    if not langs:
        langs = list(DEFAULT_CONFIG["languages"])

    raw_themes = config.get("themes", {})
    light = DEFAULT_CONFIG["themes"]["light"]
    dark = DEFAULT_CONFIG["themes"]["dark"]
    if isinstance(raw_themes, dict):
        raw_light = raw_themes.get("light")
        raw_dark = raw_themes.get("dark")
        if isinstance(raw_light, str) and raw_light in AVAILABLE_THEMES:
            light = raw_light
        if isinstance(raw_dark, str) and raw_dark in AVAILABLE_THEMES:
            dark = raw_dark

    return {
        "languages": langs,
        "themes": {"light": light, "dark": dark},
        "cardless": bool(config.get("cardless", False)),
    }


def get_config() -> dict:
    """Get add-on config, falling back to defaults."""
    from aqt import mw

    addon = __name__.split(".")[0]
    raw = mw.addonManager.getConfig(addon)
    normalized = _normalize_config(raw)

    # Persist defaults/sanitized values so future runs are deterministic.
    if raw != normalized:
        mw.addonManager.writeConfig(addon, normalized)

    return normalized


def generate_config_json() -> str:
    """Generate JSON config string for embedding in templates."""
    config = get_config()
    available = sorted(store.local_langs())
    return json.dumps({
        "languages": config.get("languages", []),
        "availableLanguages": available,
        "themes": config.get("themes", {}),
        "cardless": config.get("cardless", False),
    }, separators=(",", ":"))
