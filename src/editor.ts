/**
 * Editor integration for Anki Markdown note types.
 * Hides rich-text UI while preserving functionality.
 */
import "./editor.css";

declare function require(name: string): any;
declare const globalThis: any;

const { loaded } = require("anki/ui") as { loaded: Promise<void> };

globalThis.ankiMdActivate = async () => {
  await loaded;
  document.body.classList.add("anki-md-active");
  globalThis.setCloseHTMLTags(false);
};

globalThis.ankiMdDeactivate = async () => {
  await loaded;
  document.body.classList.remove("anki-md-active");
  globalThis.setCloseHTMLTags(true);
};
