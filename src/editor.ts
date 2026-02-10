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

/** Editor settings to force-disable for markdown notes. */
const settings = ["setCloseHTMLTags", "setShrinkImages", "setMathjaxEnabled"];

/** Get boolean array matching field count. */
const fields = async (val: boolean) =>
  (await instances[0]?.fields)?.map(() => val);

globalThis.ankiMdActivate = async () => {
  await loaded;
  document.body.classList.add("anki-md-active");
  for (const fn of settings) globalThis[fn](false);
  globalThis.setPlainTexts(await fields(true));
};

globalThis.ankiMdDeactivate = async () => {
  await loaded;
  document.body.classList.remove("anki-md-active");
  for (const fn of settings) globalThis[fn](true);
  globalThis.setPlainTexts(await fields(false));
};

/** Wrap editor globals to force correct values when active. */
loaded.then(() => {
  for (const fn of settings) {
    const orig = globalThis[fn];
    globalThis[fn] = (val: boolean) => orig(active() ? false : val);
  }
  const orig = globalThis.setPlainTexts;
  globalThis.setPlainTexts = (vals: boolean[]) =>
    orig(active() ? vals.map(() => true) : vals);
});
