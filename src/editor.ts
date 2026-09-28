// Editor integration for Anki Markdown note types.
// Forces plain-text mode and disables HTML syntax highlighting.
import "./editor.css";

declare function require(name: string): any;
declare const globalThis: any;

interface CodeMirrorAPI {
  editor: Promise<CodeMirror>;
  setOption(key: string, value: unknown): Promise<void>;
}

interface Position {
  line: number;
  ch: number;
}

interface CodeMirror {
  on(event: "paste", callback: typeof paste): void;
  off(event: "paste", callback: typeof paste): void;
  getDoc(): unknown;
  getValue(): string;
  getCursor(position: "from" | "to"): Position;
  getWrapperElement(): HTMLElement;
  replaceRange(text: string, from: Position, to: Position, origin: string): void;
}

interface PlainTextInputAPI {
  codeMirror: CodeMirrorAPI;
}

const { loaded } = require("anki/ui") as { loaded: Promise<void> };
const { bridgeCommand } = require("anki/bridgecommand") as {
  bridgeCommand(command: string, callback: (text: string | null) => void): void;
};
const { instances } = require("anki/NoteEditor");
const { lifecycle, instances: plainTexts } = require("anki/PlainTextInput") as {
  lifecycle: {
    onMount(cb: (api: PlainTextInputAPI) => void): void;
    onDestroy(cb: (api: PlainTextInputAPI) => void): void;
  };
  instances: PlainTextInputAPI[];
};
const active = () => document.body.classList.contains("anki-md-active");
let revision = 0;

function paste(editor: CodeMirror, event: ClipboardEvent): void {
  const data = event.clipboardData;
  // HTML selections need Anki's full HTML filter; leave them on the text path.
  if (!active() || !data?.files.length || data.getData("text/html")) return;
  event.preventDefault();

  const token = revision;
  const doc = editor.getDoc();
  const before = editor.getValue();
  const from = editor.getCursor("from");
  const to = editor.getCursor("to");
  const fallback = data.getData("text/plain");
  bridgeCommand("anki-markdown:paste", (result) => {
    // Anki resets CodeMirror's value on blur, so history generations are unsuitable here.
    if (
      token !== revision ||
      editor.getDoc() !== doc ||
      editor.getValue() !== before ||
      !editor.getWrapperElement().isConnected
    )
      return;
    const text = result ?? fallback;
    if (text) editor.replaceRange(text, from, to, "paste");
  });
}

// Editor settings to force-disable for markdown notes
const settings = ["setCloseHTMLTags", "setShrinkImages", "setMathjaxEnabled"];

// Get boolean array matching field count
const fields = async (val: boolean) => (await instances[0]?.fields)?.map(() => val);

async function setPlainText(val: boolean): Promise<void> {
  const list = await fields(val);
  if (list) globalThis.setPlainTexts(list);
}

// Set a CodeMirror option on all plain-text inputs
async function setOption(key: string, value: unknown): Promise<void> {
  await Promise.all(plainTexts.map((pt) => pt.codeMirror.setOption(key, value)));
}

globalThis.ankiMdActivate = async () => {
  revision++;
  await loaded;
  document.body.classList.add("anki-md-active");
  for (const fn of settings) globalThis[fn](false);
  await setPlainText(true);
  await setOption("mode", "null");
};

globalThis.ankiMdDeactivate = async () => {
  revision++;
  await loaded;
  document.body.classList.remove("anki-md-active");
  for (const fn of settings) globalThis[fn](true);
  await setPlainText(false);
};

// Wrap editor globals to force correct values when active
loaded.then(() => {
  for (const fn of settings) {
    const orig = globalThis[fn];
    globalThis[fn] = (val: boolean) => orig(active() ? false : val);
  }
  const orig = globalThis.setPlainTexts;
  globalThis.setPlainTexts = (vals: boolean[]) => orig(active() ? vals.map(() => true) : vals);
});

const cleanups = new WeakMap<PlainTextInputAPI, () => void>();

function mount(api: PlainTextInputAPI): void {
  if (cleanups.has(api)) return;
  let mounted = true;
  let editor: CodeMirror | undefined;
  cleanups.set(api, () => {
    mounted = false;
    editor?.off("paste", paste);
    cleanups.delete(api);
  });
  api.codeMirror.editor.then((instance) => {
    if (!mounted) return;
    editor = instance;
    editor.on("paste", paste);
    if (active()) api.codeMirror.setOption("mode", "null");
  });
}

lifecycle.onMount(mount);
lifecycle.onDestroy((api) => cleanups.get(api)?.());
plainTexts.forEach(mount);
