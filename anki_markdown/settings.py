"""Settings dialog for Anki Markdown syntax highlighting configuration."""

import json
from pathlib import Path
import platform
import plistlib
import sys

from aqt.qt import (
    QDialog,
    QVBoxLayout,
    QHBoxLayout,
    QFrame,
    QListWidget,
    QListWidgetItem,
    QComboBox,
    QPushButton,
    QLabel,
    QLineEdit,
    QCheckBox,
    QAbstractItemView,
    QMessageBox,
    QApplication,
    Qt,
)
from aqt import mw

from .shiki import (
    AVAILABLE_LANGS,
    AVAILABLE_THEMES,
    SHIKI_VERSION,
    get_config,
    store,
)

ADDON_DIR = Path(__file__).parent
ADDON_VERSION = json.loads((ADDON_DIR / "manifest.json").read_text(encoding="utf-8"))["version"]
REPO_URL = "https://github.com/terkelg/anki-markdown"


def ver(obj) -> str | None:
    """Read one appVersion-style attribute from an object."""
    val = getattr(obj, "appVersion", None)
    if isinstance(val, str) and val:
        return val
    if callable(val):
        try:
            out = val()
        except TypeError:
            out = None
        if out:
            return str(out)
    return None


def anki_ver() -> str:
    """Best-effort Anki version for issue reports."""
    if val := ver(mw):
        return val

    try:
        import aqt

        if val := ver(aqt):
            return val
    except Exception:
        pass

    if sys.platform == "darwin":
        path = Path(sys.executable).resolve().parent.parent / "Info.plist"
        if path.exists():
            try:
                data = plistlib.loads(path.read_bytes())
                val = data.get("CFBundleShortVersionString")
                if val:
                    return str(val)
            except Exception:
                pass

    return "unknown"


def debug_report() -> str:
    """Build a clipboard-ready debug report."""
    config = get_config()
    theme = config.get("themes", {})
    lines = [
        "Anki Markdown debug info",
        f"anki_markdown: {ADDON_VERSION}",
        f"anki: {anki_ver()}",
        f"python: {platform.python_implementation()} {platform.python_version()}",
        f"os: {platform.platform()}",
        f"light theme: {theme.get('light', '-')}",
        f"dark theme: {theme.get('dark', '-')}",
        f"cardless: {config.get('cardless', False)}",
        "",
        store.debug_text(config),
    ]
    return "\n".join(lines)


class ShikiSettingsDialog(QDialog):
    """Settings dialog for configuring Shiki languages and themes."""

    def __init__(self, parent=None):
        super().__init__(parent or mw)
        self.setWindowTitle("Anki Markdown - Syntax Highlighting")
        self.setMinimumWidth(400)
        self.setMinimumHeight(500)
        self.setStyleSheet(
            """
            QFrame[ankiMdSection="true"] {
                border: 1px solid rgba(255, 255, 255, 0.10);
                border-radius: 4px;
                background-color: rgba(255, 255, 255, 0.03);
            }
            QLabel[ankiMdTitle="true"] {
                font-weight: 600;
            }
            """
        )
        self.setup_ui()
        self.load_config()

    def section(self, title: str) -> tuple[QFrame, QVBoxLayout]:
        """Create one boxed settings section with a real title label."""
        box = QFrame()
        box.setProperty("ankiMdSection", True)
        layout = QVBoxLayout(box)
        layout.setContentsMargins(14, 10, 14, 14)
        layout.setSpacing(10)
        label = QLabel(title)
        label.setProperty("ankiMdTitle", True)
        layout.addWidget(label)
        return box, layout

    def link(self, text: str, href: str, open: bool) -> QLabel:
        """Create one footer link label."""
        label = QLabel(
            f'<a href="{href}" style="color: gray; text-decoration: none;">{text}</a>'
        )
        label.setStyleSheet("font-size: 11px;")
        label.setTextFormat(Qt.TextFormat.RichText)
        label.setTextInteractionFlags(Qt.TextInteractionFlag.LinksAccessibleByMouse)
        label.setOpenExternalLinks(open)
        return label

    def setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setSpacing(12)

        # Language section
        langs, lang_layout = self.section("Languages")
        lang_layout.addWidget(QLabel("Select languages for syntax highlighting.\nNew languages require an internet connection to download."))

        filter_row = QHBoxLayout()
        self.lang_filter = QLineEdit()
        self.lang_filter.setPlaceholderText("Filter languages...")
        self.lang_filter.textChanged.connect(self.filter_languages)
        filter_row.addWidget(self.lang_filter)

        self.show_selected = QCheckBox("Selected only")
        self.show_selected.toggled.connect(self.filter_languages)
        filter_row.addWidget(self.show_selected)
        lang_layout.addLayout(filter_row)

        self.lang_list = QListWidget()
        self.lang_list.setSelectionMode(QAbstractItemView.SelectionMode.MultiSelection)
        self.lang_list.itemSelectionChanged.connect(self.on_selection_changed)
        for lang in sorted(AVAILABLE_LANGS):
            item = QListWidgetItem(lang)
            item.setData(Qt.ItemDataRole.UserRole, lang)
            self.lang_list.addItem(item)
        lang_layout.addWidget(self.lang_list)

        # Info label
        self.info_label = QLabel("")
        self.info_label.setWordWrap(True)
        lang_layout.addWidget(self.info_label)
        layout.addWidget(langs)

        # Theme section
        themes, theme_layout = self.section("Theme")
        theme_layout.setSpacing(4)

        theme_row1 = QHBoxLayout()
        theme_row1.setContentsMargins(0, 0, 0, 0)
        theme_row1.addWidget(QLabel("Light mode:"))
        self.light_theme = QComboBox()
        self.light_theme.addItems(sorted(AVAILABLE_THEMES))
        theme_row1.addWidget(self.light_theme)
        theme_layout.addLayout(theme_row1)

        theme_row2 = QHBoxLayout()
        theme_row2.setContentsMargins(0, 0, 0, 0)
        theme_row2.addWidget(QLabel("Dark mode:"))
        self.dark_theme = QComboBox()
        self.dark_theme.addItems(sorted(AVAILABLE_THEMES))
        theme_row2.addWidget(self.dark_theme)
        theme_layout.addLayout(theme_row2)
        layout.addWidget(themes)

        # UI section
        ui, ui_layout = self.section("UI")
        self.cardless = QCheckBox("Cardless")
        self.cardless.setToolTip("Remove card border, shadow, and background on wide screens")
        ui_layout.addWidget(self.cardless)
        layout.addWidget(ui)

        meta = QHBoxLayout()
        version = QLabel(f"Anki Markdown {ADDON_VERSION} · Shiki {SHIKI_VERSION}")
        version.setStyleSheet("color: gray; font-size: 11px;")
        meta.addWidget(version)
        meta.addStretch()

        repo = self.link("Repo", REPO_URL, True)
        meta.addWidget(repo)

        sep = QLabel("·")
        sep.setStyleSheet("color: gray; font-size: 11px;")
        meta.addWidget(sep)

        self.debug = self.link("Debug info", "debug", False)
        self.debug.linkActivated.connect(self.export_debug)
        meta.addWidget(self.debug)
        layout.addLayout(meta)

        # Buttons
        buttons = QHBoxLayout()

        self.apply_btn = QPushButton("Save")
        self.apply_btn.clicked.connect(self.apply_config)
        buttons.addWidget(self.apply_btn)

        cancel_btn = QPushButton("Cancel")
        cancel_btn.clicked.connect(self.reject)
        buttons.addWidget(cancel_btn)

        layout.addLayout(buttons)

    def filter_languages(self, _=None):
        """Filter language list based on search text and selected-only toggle."""
        text = self.lang_filter.text().lower()
        selected_only = self.show_selected.isChecked()
        for i in range(self.lang_list.count()):
            item = self.lang_list.item(i)
            lang = item.data(Qt.ItemDataRole.UserRole)
            matches_text = text in lang.lower()
            matches_selected = not selected_only or item.isSelected()
            item.setHidden(not (matches_text and matches_selected))

    def on_selection_changed(self):
        """Handle selection changes - update info and re-filter if needed."""
        self.update_info()
        if self.show_selected.isChecked():
            self.filter_languages()

    def load_config(self):
        """Load current config into UI."""
        config = get_config()

        # Select configured languages
        configured_langs = set(config.get("languages", []))
        for i in range(self.lang_list.count()):
            item = self.lang_list.item(i)
            lang = item.data(Qt.ItemDataRole.UserRole)
            item.setSelected(lang in configured_langs)

        # Set themes
        themes = config.get("themes", {})
        light = themes.get("light", "vitesse-light")
        dark = themes.get("dark", "vitesse-dark")

        idx = self.light_theme.findText(light)
        if idx >= 0:
            self.light_theme.setCurrentIndex(idx)

        idx = self.dark_theme.findText(dark)
        if idx >= 0:
            self.dark_theme.setCurrentIndex(idx)

        self.cardless.setChecked(config.get("cardless", False))

        self.update_info()

    def get_selected_languages(self) -> list[str]:
        """Get list of selected language names."""
        return [
            self.lang_list.item(i).data(Qt.ItemDataRole.UserRole)
            for i in range(self.lang_list.count())
            if self.lang_list.item(i).isSelected()
        ]

    def update_info(self):
        """Update info label with selection count."""
        count = len(self.get_selected_languages())
        self.info_label.setText(f"Selected: {count} language(s)")

    def export_debug(self):
        """Copy issue-report debug info to the clipboard."""
        QApplication.clipboard().setText(debug_report())
        QMessageBox.information(self, "Anki Markdown", "Debug info copied to clipboard.")

    def apply_config(self):
        """Save config and download missing files."""
        langs = self.get_selected_languages()

        if not langs:
            QMessageBox.warning(
                self,
                "No Languages Selected",
                "Please select at least one language.",
            )
            return

        # Build new config
        config = get_config()
        config["languages"] = langs
        config["themes"] = {
            "light": self.light_theme.currentText(),
            "dark": self.dark_theme.currentText(),
        }
        config["cardless"] = self.cardless.isChecked()

        # Save config
        addon_name = __name__.split(".")[0]
        mw.addonManager.writeConfig(addon_name, config)

        # Show loading state
        self.apply_btn.setText("Saving...")
        self.apply_btn.setEnabled(False)
        QApplication.setOverrideCursor(Qt.CursorShape.WaitCursor)
        QApplication.processEvents()

        try:
            # Download missing files
            downloaded, errors = store.sync(config)

            # Cleanup unused files
            removed = store.cleanup(config)

            # Sync to collection.media (pass removed files to trash from media)
            from . import sync_media
            sync_media(removed)

            # Update note type templates
            from . import ensure_basic_notetype
            ensure_basic_notetype()

            QApplication.restoreOverrideCursor()

            # Show result
            msg_parts = []
            if downloaded:
                msg_parts.append(f"Downloaded: {len(downloaded)} file(s)")
            if removed:
                msg_parts.append(f"Removed: {len(removed)} unused file(s)")
            if errors:
                msg_parts.append(f"Errors: {len(errors)}")
                for err in errors:
                    msg_parts.append(f"  - {err}")

            if msg_parts:
                QMessageBox.information(self, "Sync Complete", "\n".join(msg_parts))

            self.accept()

        except Exception as e:
            QApplication.restoreOverrideCursor()
            self.apply_btn.setText("Save")
            self.apply_btn.setEnabled(True)
            QMessageBox.critical(self, "Error", f"Failed to sync: {e}")


def show_settings():
    """Show the settings dialog."""
    dialog = ShikiSettingsDialog(mw)
    dialog.exec()
