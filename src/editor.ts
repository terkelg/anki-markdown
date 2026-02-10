/**
 * Editor integration for Anki Markdown note types.
 * Hides rich-text input per field using Anki's own APIs.
 */
import "./editor.css";

declare function require(name: string): any;
declare const globalThis: any;

const { loaded } = require("anki/ui") as { loaded: Promise<void> };
const { instances } = require("anki/NoteEditor");
const active = () => document.body.classList.contains("anki-md-active");

/** Get boolean array matching field count. */
const texts = async (val: boolean) =>
  (await instances[0]?.fields)?.map(() => val);

globalThis.ankiMdActivate = async () => {
  await loaded;
  document.body.classList.add("anki-md-active");
  globalThis.setCloseHTMLTags(false);
  globalThis.setPlainTexts(await texts(true));
};

globalThis.ankiMdDeactivate = async () => {
  await loaded;
  document.body.classList.remove("anki-md-active");
  globalThis.setCloseHTMLTags(true);
  globalThis.setPlainTexts(await texts(false));
};

/** Wrap setPlainTexts to force plain-text mode when active. */
loaded.then(() => {
  const orig = globalThis.setPlainTexts;
  globalThis.setPlainTexts = (texts: boolean[]) =>
    orig(active() ? texts.map(() => true) : texts);
});
