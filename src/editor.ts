/**
 * Editor integration for Anki Markdown note types.
 * Hides rich-text UI while preserving functionality.
 */
import "./editor.css";

Object.assign(window, {
  ankiMdActivate: () => document.body.classList.add("anki-md-active"),
  ankiMdDeactivate: () => document.body.classList.remove("anki-md-active"),
});
