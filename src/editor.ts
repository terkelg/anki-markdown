// Editor integration for Anki Markdown note types.
// Forces plain-text mode and disables HTML syntax highlighting.
import "./editor.css";

declare function require(name: string): any;
declare const globalThis: any;

interface CodeMirrorAPI {
  setOption(key: string, value: unknown): Promise<void>;
}

interface PlainTextInputAPI {
  codeMirror: CodeMirrorAPI;
}

const { loaded } = require("anki/ui") as { loaded: Promise<void> };
const { instances } = require("anki/NoteEditor");
const { lifecycle, instances: plainTexts } = require("anki/PlainTextInput") as {
  lifecycle: { onMount(cb: (api: PlainTextInputAPI) => (() => void) | void): void };
  instances: PlainTextInputAPI[];
};
const active = () => document.body.classList.contains("anki-md-active");

// Editor settings to force-disable for markdown notes
const settings = ["setCloseHTMLTags", "setShrinkImages", "setMathjaxEnabled"];

// Get boolean array matching field count
const fields = async (val: boolean) =>
  (await instances[0]?.fields)?.map(() => val);

// Set a CodeMirror option on all plain-text inputs
async function setOption(key: string, value: unknown): Promise<void> {
  await Promise.all(plainTexts.map((pt) => pt.codeMirror.setOption(key, value)));
}

globalThis.ankiMdActivate = async () => {
  await loaded;
  document.body.classList.add("anki-md-active");
  for (const fn of settings) globalThis[fn](false);
  globalThis.setPlainTexts(await fields(true));
  setOption("mode", "null");
};

globalThis.ankiMdDeactivate = async () => {
  await loaded;
  document.body.classList.remove("anki-md-active");
  for (const fn of settings) globalThis[fn](true);
  globalThis.setPlainTexts(await fields(false));
};

// Wrap editor globals to force correct values when active
loaded.then(() => {
  for (const fn of settings) {
    const orig = globalThis[fn];
    globalThis[fn] = (val: boolean) => orig(active() ? false : val);
  }
  const orig = globalThis.setPlainTexts;
  globalThis.setPlainTexts = (vals: boolean[]) =>
    orig(active() ? vals.map(() => true) : vals);
});

// Disable highlighting on any plain-text input that mounts while active
lifecycle.onMount((api: PlainTextInputAPI) => {
  if (active()) api.codeMirror.setOption("mode", "null");
});
