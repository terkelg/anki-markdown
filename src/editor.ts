/**
 * Editor integration for Anki Markdown note types.
 *
 * Toggles .anki-md-active class on body to visually hide rich-text editor UI
 * while preserving its functionality (drag-drop, paste handling, etc.).
 * Called from Python via webview.eval() when switching note types.
 */
import "./editor.css";

(window as any).ankiMdActivate = function () {
  document.body.classList.add("anki-md-active");
};

(window as any).ankiMdDeactivate = function () {
  document.body.classList.remove("anki-md-active");
};
