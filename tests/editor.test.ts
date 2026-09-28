import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../src/editor.ts", import.meta.url), "utf8");
const code = new Bun.Transpiler({ loader: "ts" }).transformSync(source.replace('import "./editor.css";', ""));
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function input() {
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
  return { api, editor, element, listeners, paste };
}

async function setup(existing = true) {
  const field = input();
  const classes = new Set<string>();
  const mounts: Function[] = [];
  const destroys: Function[] = [];
  const requests: { command: string; callback: (text: string | null) => void }[] = [];
  const packages = {
    "anki/ui": { loaded: Promise.resolve() },
    "anki/NoteEditor": { instances: [{ fields: Promise.resolve([{}, {}]) }] },
    "anki/PlainTextInput": {
      instances: existing ? [field.api] : [],
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
    ...field,
    host,
    requests,
    mount: (api = field.api) => mounts.forEach((f) => f(api)),
    destroy: () => destroys.forEach((f) => f(field.api)),
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

test("declined native payload retains its text fallback", async () => {
  const field = await setup();
  field.paste(1, "a file path");
  field.requests[0].callback(null);
  expect(field.editor.value).toBe("LEFT a file path RIGHT");
});

test("a failed image import does not delete selected text", async () => {
  const field = await setup();
  field.paste();
  field.requests[0].callback("");
  expect(field.editor.value).toBe("LEFT REMOVE RIGHT");
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
  const field = await setup();
  field.mount();
  await flush();
  expect(field.listeners.size).toBe(1);
  field.destroy();
  expect(field.listeners.size).toBe(0);

  const next = await setup(false);
  next.mount();
  await flush();
  expect(next.listeners.size).toBe(1);
  next.destroy();
  expect(next.listeners.size).toBe(0);
});

test("destroying an input before CodeMirror resolves leaves no listener", async () => {
  const field = await setup(false);
  field.mount();
  field.destroy();
  await flush();
  expect(field.listeners.size).toBe(0);
});
