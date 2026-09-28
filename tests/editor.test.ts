import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../src/editor.ts", import.meta.url), "utf8");
const code = new Bun.Transpiler({ loader: "ts" }).transformSync(source.replace('import "./editor.css";', ""));
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

async function setup(existing = true) {
  const listeners = new Set<Function>();
  const element = { isConnected: true };
  const editor = {
    value: "LEFT REMOVE RIGHT",
    from: { line: 0, ch: 5 },
    to: { line: 0, ch: 11 },
    doc: {},
    changes: [] as string[],
    on: (_event: string, callback: Function) => listeners.add(callback),
    off: (_event: string, callback: Function) => listeners.delete(callback),
    getDoc: () => editor.doc,
    getValue: () => editor.value,
    getCursor: (position: "from" | "to") => ({ ...editor[position] }),
    getWrapperElement: () => element,
    replaceRange: (text: string, from: { ch: number }, to: { ch: number }, origin: string) => {
      editor.value = editor.value.slice(0, from.ch) + text + editor.value.slice(to.ch);
      editor.changes.push(origin);
    },
  };
  const api = { codeMirror: { editor: Promise.resolve(editor), setOption: async () => {} } };
  function paste(files = 1, text = "", html = "") {
    const event = {
      prevented: false,
      preventDefault() {
        this.prevented = true;
      },
      clipboardData: {
        files: Array(files).fill({}),
        getData: (type: string) => (type === "text/html" ? html : text),
      },
    };
    for (const listener of listeners) listener(editor, event);
    return event;
  }
  const classes = new Set<string>();
  const mounts: Function[] = [];
  const destroys: Function[] = [];
  const requests: { command: string; callback: (text: string | null) => void }[] = [];
  const packages = {
    "anki/ui": { loaded: Promise.resolve() },
    "anki/NoteEditor": { instances: [{ fields: Promise.resolve([{}, {}]) }] },
    "anki/PlainTextInput": {
      instances: existing ? [api] : [],
      lifecycle: {
        onMount: (callback: Function) => mounts.push(callback),
        onDestroy: (callback: Function) => destroys.push(callback),
      },
    },
    "anki/bridgecommand": {
      bridgeCommand: (command: string, callback: (text: string | null) => void) => requests.push({ command, callback }),
    },
  };
  const context = {
    require: (name: keyof typeof packages) => packages[name],
    document: {
      body: {
        classList: {
          contains: (name: string) => classes.has(name),
          add: (name: string) => classes.add(name),
          remove: (name: string) => classes.delete(name),
        },
      },
    },
    setCloseHTMLTags() {},
    setShrinkImages() {},
    setMathjaxEnabled() {},
    setPlainTexts() {},
  };
  runInNewContext(code, context);
  const host = context as typeof context & { ankiMdActivate(): Promise<void>; ankiMdDeactivate(): Promise<void> };
  await host.ankiMdActivate();
  await flush();
  return {
    editor,
    element,
    listeners,
    paste,
    host,
    requests,
    mount: () => mounts.forEach((f) => f(api)),
    destroy: () => destroys.forEach((f) => f(api)),
  };
}

test("image response replaces the initiating selection even if the caret moves", async () => {
  const field = await setup();
  expect(field.paste().prevented).toBe(true);
  expect(field.requests[0].command).toBe("anki-markdown:paste");
  field.editor.from = field.editor.to = { line: 0, ch: 0 };
  field.requests[0].callback("![](image.png)");
  expect(field.editor.value).toBe("LEFT ![](image.png) RIGHT");
  expect(field.editor.changes).toEqual(["paste"]);
});

test("ordinary text, URLs, and copied HTML retain CodeMirror's normal paste path", async () => {
  const field = await setup();
  expect(field.paste(0, "alpha **bold**\n  code").prevented).toBe(false);
  expect(field.paste(0, "https://example.com/image.png").prevented).toBe(false);
  expect(field.paste(1, "caption", '<img src="image.png">').prevented).toBe(false);
  expect(field.requests).toHaveLength(0);
});

test.each([
  [null, "a file path", "LEFT a file path RIGHT"],
  ["", "", "LEFT REMOVE RIGHT"],
])("native result %p preserves fallback text or the selection", async (result, fallback, expected) => {
  const field = await setup();
  field.paste(1, fallback);
  field.requests[0].callback(result);
  expect(field.editor.value).toBe(expected);
});

for (const change of ["text", "document", "note", "inactive", "detached"] as const) {
  test(`a pending response is discarded after ${change} changes`, async () => {
    const field = await setup();
    field.paste();
    if (change === "text") field.editor.value = "new text";
    if (change === "document") field.editor.doc = {};
    if (change === "note") await field.host.ankiMdActivate();
    if (change === "inactive") await field.host.ankiMdDeactivate();
    if (change === "detached") field.element.isConnected = false;
    field.requests[0].callback("![](image.png)");
    expect(field.editor.changes).toHaveLength(0);
  });
}

test("non-Markdown notes do not intercept image paste", async () => {
  const field = await setup();
  await field.host.ankiMdDeactivate();
  expect(field.paste().prevented).toBe(false);
  expect(field.requests).toHaveLength(0);
});

test("existing and newly mounted inputs get one listener, removed on destruction", async () => {
  for (const existing of [true, false]) {
    const field = await setup(existing);
    field.mount();
    await flush();
    expect(field.listeners.size).toBe(1);
    field.destroy();
    expect(field.listeners.size).toBe(0);
  }
});

test("destroying an input before CodeMirror resolves leaves no listener", async () => {
  const field = await setup(false);
  field.mount();
  field.destroy();
  await flush();
  expect(field.listeners.size).toBe(0);
});
