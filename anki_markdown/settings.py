"""Settings dialog for Anki Markdown syntax highlighting configuration."""

from aqt.qt import (
    QDialog,
    QVBoxLayout,
    QHBoxLayout,
    QListWidget,
    QListWidgetItem,
    QComboBox,
    QPushButton,
    QLabel,
    QLineEdit,
    QCheckBox,
    QAbstractItemView,
    QProgressDialog,
    QMessageBox,
    Qt,
)
from aqt import mw

from .shiki import (
    AVAILABLE_LANGS,
    AVAILABLE_THEMES,
    get_config,
    sync_shiki_files,
    cleanup_unused,
)


class ShikiSettingsDialog(QDialog):
    """Settings dialog for configuring Shiki languages and themes."""

    def __init__(self, parent=None):
        super().__init__(parent or mw)
        self.setWindowTitle("Anki Markdown - Syntax Highlighting")
        self.setMinimumWidth(400)
        self.setMinimumHeight(500)
        self.setup_ui()
        self.load_config()

    def setup_ui(self):
        layout = QVBoxLayout(self)

        # Language section
        layout.addWidget(QLabel("<b>Languages</b>"))
        layout.addWidget(QLabel("Select languages for syntax highlighting:"))

        filter_row = QHBoxLayout()
        self.lang_filter = QLineEdit()
        self.lang_filter.setPlaceholderText("Filter languages...")
        self.lang_filter.textChanged.connect(self.filter_languages)
        filter_row.addWidget(self.lang_filter)

        self.show_selected = QCheckBox("Selected only")
        self.show_selected.toggled.connect(self.filter_languages)
        filter_row.addWidget(self.show_selected)
        layout.addLayout(filter_row)

        self.lang_list = QListWidget()
        self.lang_list.setSelectionMode(QAbstractItemView.SelectionMode.MultiSelection)
        self.lang_list.itemSelectionChanged.connect(self.on_selection_changed)
        for lang in sorted(AVAILABLE_LANGS):
            item = QListWidgetItem(lang)
            item.setData(Qt.ItemDataRole.UserRole, lang)
            self.lang_list.addItem(item)
        layout.addWidget(self.lang_list)

        # Theme section
        layout.addWidget(QLabel("<b>Themes</b>"))

        theme_row1 = QHBoxLayout()
        theme_row1.addWidget(QLabel("Light mode:"))
        self.light_theme = QComboBox()
        self.light_theme.addItems(sorted(AVAILABLE_THEMES))
        theme_row1.addWidget(self.light_theme)
        layout.addLayout(theme_row1)

        theme_row2 = QHBoxLayout()
        theme_row2.addWidget(QLabel("Dark mode:"))
        self.dark_theme = QComboBox()
        self.dark_theme.addItems(sorted(AVAILABLE_THEMES))
        theme_row2.addWidget(self.dark_theme)
        layout.addLayout(theme_row2)

        # Info label
        self.info_label = QLabel("")
        self.info_label.setWordWrap(True)
        layout.addWidget(self.info_label)

        # Buttons
        buttons = QHBoxLayout()

        self.apply_btn = QPushButton("Apply && Download")
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

        # Save config
        addon_name = __name__.split(".")[0]
        mw.addonManager.writeConfig(addon_name, config)

        # Show progress
        progress = QProgressDialog("Downloading language files...", "Cancel", 0, 0, self)
        progress.setWindowModality(Qt.WindowModality.WindowModal)
        progress.setMinimumDuration(0)
        progress.setValue(0)
        progress.show()

        try:
            # Download missing files
            downloaded, errors = sync_shiki_files()

            # Cleanup unused files
            removed = cleanup_unused(config)

            progress.close()

            # Sync to collection.media (pass removed files to trash from media)
            from . import sync_media
            sync_media(removed)

            # Update note type templates
            from . import ensure_notetype
            ensure_notetype()

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
            progress.close()
            QMessageBox.critical(self, "Error", f"Failed to sync: {e}")


def show_settings():
    """Show the settings dialog."""
    dialog = ShikiSettingsDialog(mw)
    dialog.exec()
