"""Shiki language and theme management for Anki Markdown.

Downloads language grammars and themes from esm.sh and manages them
in collection.media for mobile sync.
"""

from pathlib import Path
import urllib.request
import urllib.error
import ssl
import json

from aqt import mw

ADDON_DIR = Path(__file__).parent
ESM_BASE = "https://esm.sh/@shikijs"

# All available Shiki languages (subset of most common)
AVAILABLE_LANGS = [
    "abap", "actionscript-3", "ada", "angular-html", "angular-ts", "apache",
    "apex", "apl", "applescript", "ara", "asciidoc", "asm", "astro", "awk",
    "ballerina", "bash", "bat", "beancount", "berry", "bibtex", "bicep",
    "blade", "c", "cadence", "cairo", "clarity", "clojure", "cmake", "cobol",
    "codeowners", "codeql", "coffee", "common-lisp", "coq", "cpp", "crystal",
    "css", "csv", "cue", "cypher", "d", "dart", "dax", "desktop", "diff",
    "docker", "dotenv", "dream-maker", "edge", "elixir", "elm", "emacs-lisp",
    "erb", "erlang", "fennel", "fish", "fluent", "fortran-fixed-form",
    "fortran-free-form", "fsharp", "gdresource", "gdscript", "gdshader",
    "genie", "gherkin", "git-commit", "git-rebase", "gleam", "glimmer-js",
    "glimmer-ts", "glsl", "gnuplot", "go", "graphql", "groovy", "hack",
    "haml", "handlebars", "haskell", "haxe", "hcl", "hjson", "hlsl", "html",
    "html-derivative", "http", "hxml", "hy", "imba", "ini", "java",
    "javascript", "jinja", "jison", "json", "json5", "jsonc", "jsonl",
    "jsonnet", "jssm", "jsx", "julia", "kotlin", "kusto", "latex", "lean",
    "less", "liquid", "llvm", "log", "logo", "lua", "luau", "make",
    "markdown", "marko", "matlab", "mdc", "mdx", "mermaid", "mipsasm", "mojo",
    "move", "narrat", "nextflow", "nginx", "nim", "nix", "nushell",
    "objective-c", "objective-cpp", "ocaml", "pascal", "perl", "php",
    "plsql", "po", "postcss", "powerquery", "powershell", "prisma", "prolog",
    "proto", "pug", "puppet", "purescript", "python", "qml", "qmldir", "qss",
    "r", "racket", "raku", "razor", "reg", "regexp", "rel", "riscv", "rst",
    "ruby", "rust", "sas", "sass", "scala", "scheme", "scss", "shaderlab",
    "shellscript", "shellsession", "smalltalk", "solidity", "soy", "sparql",
    "splunk", "sql", "ssh-config", "stata", "stylus", "svelte", "swift",
    "system-verilog", "systemd", "tasl", "tcl", "templ", "terraform", "tex",
    "toml", "ts-tags", "tsv", "tsx", "turtle", "twig", "typescript",
    "typespec", "typst", "v", "vala", "vb", "verilog", "vhdl", "viml",
    "vue", "vue-html", "vyper", "wasm", "wenyan", "wgsl", "wikitext",
    "wolfram", "xml", "xsl", "yaml", "zenscript", "zig",
]

# All available Shiki themes
AVAILABLE_THEMES = [
    "andromeeda", "aurora-x", "ayu-dark", "catppuccin-frappe",
    "catppuccin-latte", "catppuccin-macchiato", "catppuccin-mocha",
    "dark-plus", "dracula", "dracula-soft", "everforest-dark",
    "everforest-light", "github-dark", "github-dark-default",
    "github-dark-dimmed", "github-dark-high-contrast", "github-light",
    "github-light-default", "github-light-high-contrast", "houston",
    "kanagawa-dragon", "kanagawa-lotus", "kanagawa-wave", "laserwave",
    "light-plus", "material-theme", "material-theme-darker",
    "material-theme-lighter", "material-theme-ocean",
    "material-theme-palenight", "min-dark", "min-light", "monokai",
    "night-owl", "nord", "one-dark-pro", "one-light", "plastic",
    "poimandres", "red", "rose-pine", "rose-pine-dawn", "rose-pine-moon",
    "slack-dark", "slack-ochin", "snazzy-light", "solarized-dark",
    "solarized-light", "synthwave-84", "tokyo-night", "vesper",
    "vitesse-black", "vitesse-dark", "vitesse-light",
]


def get_config() -> dict:
    """Get add-on config, falling back to defaults."""
    config = mw.addonManager.getConfig(__name__.split(".")[0])
    if config is None:
        config = {
            "languages": ["javascript", "typescript", "python", "html", "css", "json", "bash", "markdown"],
            "themes": {"light": "vitesse-light", "dark": "vitesse-dark"},
            "shikiVersion": "3.20.0",
        }
    return config


def esm_url(kind: str, name: str, version: str) -> str:
    """Generate esm.sh URL for a language or theme (bundled, self-contained)."""
    pkg = "langs" if kind == "lang" else "themes"
    # Use .bundle.mjs to get self-contained files with all dependencies inlined
    return f"{ESM_BASE}/{pkg}@{version}/es2022/{name}.bundle.mjs"


def fetch_module(url: str) -> bytes:
    """Fetch module content from esm.sh."""
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers={"User-Agent": "AnkiMarkdown/1.0"})
    with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
        return resp.read()


def is_alias_module(content: bytes) -> str | None:
    """Check if module is an alias (re-export from another module).
    Returns the canonical name if it's an alias, None otherwise.
    """
    text = content.decode("utf-8")
    # Alias modules are small and contain: import{default as o}from"../NAME.mjs"
    if len(text) < 200 and 'from"../' in text:
        import re
        match = re.search(r'from"\.\./([^.]+)\.mjs"', text)
        if match:
            return match.group(1)
    return None


def download_lang(name: str, version: str) -> Path:
    """Download a language grammar and save to add-on directory.

    Handles aliases by following the redirect to the canonical module.
    """
    url = esm_url("lang", name, version)
    content = fetch_module(url)

    # Check if this is an alias (e.g., bash -> shellscript)
    canonical = is_alias_module(content)
    if canonical:
        # Fetch the canonical module instead
        url = esm_url("lang", canonical, version)
        content = fetch_module(url)

    dest = ADDON_DIR / f"_lang-{name}.js"
    dest.write_bytes(content)
    return dest


def download_theme(name: str, version: str) -> Path:
    """Download a theme and save to add-on directory."""
    url = esm_url("theme", name, version)
    content = fetch_module(url)
    dest = ADDON_DIR / f"_theme-{name}.js"
    dest.write_bytes(content)
    return dest


def get_local_langs() -> set[str]:
    """Get set of language names that exist locally."""
    return {f.stem.replace("_lang-", "") for f in ADDON_DIR.glob("_lang-*.js")}


def get_local_themes() -> set[str]:
    """Get set of theme names that exist locally."""
    return {f.stem.replace("_theme-", "") for f in ADDON_DIR.glob("_theme-*.js")}


def cleanup_unused(config: dict) -> list[str]:
    """Remove language/theme files not in config. Returns list of removed files."""
    removed = []
    configured_langs = set(config.get("languages", []))
    configured_themes = {config["themes"]["light"], config["themes"]["dark"]}

    # Remove unused languages
    for f in ADDON_DIR.glob("_lang-*.js"):
        name = f.stem.replace("_lang-", "")
        if name not in configured_langs:
            f.unlink()
            removed.append(f.name)

    # Remove unused themes
    for f in ADDON_DIR.glob("_theme-*.js"):
        name = f.stem.replace("_theme-", "")
        if name not in configured_themes:
            f.unlink()
            removed.append(f.name)

    return removed


def sync_shiki_files() -> tuple[list[str], list[str]]:
    """Ensure all configured languages/themes exist locally.

    Returns (downloaded, errors) lists.
    """
    config = get_config()
    version = config.get("shikiVersion", "3.20.0")

    downloaded = []
    errors = []

    # Download missing languages
    local_langs = get_local_langs()
    for lang in config.get("languages", []):
        if lang not in local_langs:
            try:
                download_lang(lang, version)
                downloaded.append(f"_lang-{lang}.js")
            except Exception as e:
                errors.append(f"Failed to download {lang}: {e}")

    # Download missing themes
    local_themes = get_local_themes()
    for theme in [config["themes"]["light"], config["themes"]["dark"]]:
        if theme not in local_themes:
            try:
                download_theme(theme, version)
                downloaded.append(f"_theme-{theme}.js")
            except Exception as e:
                errors.append(f"Failed to download theme {theme}: {e}")

    return downloaded, errors


def get_shiki_files() -> list[Path]:
    """Get all shiki-related files (langs + themes)."""
    return list(ADDON_DIR.glob("_lang-*.js")) + list(ADDON_DIR.glob("_theme-*.js"))


def generate_config_json() -> str:
    """Generate JSON config string for embedding in templates."""
    config = get_config()
    return json.dumps({
        "languages": config.get("languages", []),
        "themes": config.get("themes", {}),
    }, separators=(",", ":"))
