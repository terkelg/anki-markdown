import { describe, expect, test } from "bun:test";
import alerts from "markdown-it-github-alerts";
import mark from "markdown-it-mark";
import { createMarkdownExit } from "markdown-exit";
import { postProcessCloze, processCloze } from "../src/cloze";

function view(text: string): string {
  return text
    .replaceAll("\uE000", "<blank>")
    .replaceAll("\uE001", "</blank>")
    .replaceAll("\uE002", "<blur>")
    .replaceAll("\uE003", "</blur>")
    .replaceAll("\uE004", "<active>")
    .replaceAll("\uE005", "</active>")
    .replaceAll("\uE006", "<reveal>")
    .replaceAll("\uE007", "</reveal>");
}

function markdown() {
  const md = createMarkdownExit({ html: true });
  md.use(mark as never);
  md.use(alerts as never);
  return md;
}

class ClassList {
  set = new Set<string>();

  add(...list: string[]) {
    for (const item of list) this.set.add(item);
  }

  contains(item: string) {
    return this.set.has(item);
  }

  toggle(item: string) {
    if (this.set.has(item)) {
      this.set.delete(item);
      return false;
    }
    this.set.add(item);
    return true;
  }
}

function item() {
  return {
    innerHTML: "",
    textContent: "",
    dataset: {} as Record<string, string>,
    style: { cssText: "" },
    className: "",
    classList: new ClassList(),
    querySelector: () => null,
    querySelectorAll: () => [],
    setAttribute: () => {},
    removeAttribute: () => {},
    addEventListener: () => {},
    closest: () => null,
    cloneNode: () => item(),
    outerHTML: "<figure></figure>",
  };
}

function mount() {
  const wrapper = item();
  const front = item();
  const back = item();
  const root = item();
  const body = { classList: new ClassList() };
  const textarea = {
    _html: "",
    value: "",
    set innerHTML(value: string) {
      this._html = value;
      this.value = value;
    },
    get innerHTML() {
      return this._html;
    },
  };
  const template = {
    _html: "",
    content: { firstElementChild: item() },
    set innerHTML(value: string) {
      this._html = value;
      this.content.firstElementChild = item();
    },
    get innerHTML() {
      return this._html;
    },
  };
  const g = globalThis as any;
  const oldDoc = g.document;
  const oldMatch = g.matchMedia;

  g.document = {
    body,
    documentElement: root,
    getElementById: () => null,
    querySelector: (sel: string) => {
      if (sel === ".anki-md-wrapper") return wrapper;
      if (sel === ".front") return front;
      if (sel === ".back") return back;
      return null;
    },
    createElement: (tag: string) => {
      if (tag === "textarea") return textarea;
      if (tag === "template") return template;
      return item();
    },
  };
  g.matchMedia = () => ({ matches: false });

  return {
    front,
    back,
    restore() {
      g.document = oldDoc;
      g.matchMedia = oldMatch;
    },
  };
}

let render: Promise<typeof import("../src/render")> | undefined;

function loadRender() {
  render ??= import("../src/render");
  return render;
}

describe("processCloze", () => {
  test("hides repeated ordinals on the same front", () => {
    const text = "{{c1::JavaScript}} and {{c1::TypeScript}}";
    expect(view(processCloze(text, 1, "front"))).toBe(
      "<blank>[...]</blank> and <blank>[...]</blank>",
    );
  });

  test("renders hints and blur mode", () => {
    expect(view(processCloze("The {{c1::answer::city}}.", 1, "front"))).toBe(
      "The <blank>[city]</blank>.",
    );
    expect(view(processCloze("The {{c1::answer::blur}}.", 1, "front"))).toBe(
      "The <blur>answer</blur>.",
    );
    expect(view(processCloze("The {{c1::answer::blur}}.", 1, "back"))).toBe(
      "The <reveal>answer</reveal>.",
    );
  });

  test("supports nested clozes", () => {
    const text = "{{c1::Canberra was {{c2::founded}}}} in 1913";
    expect(view(processCloze(text, 1, "front"))).toBe(
      "<blank>[...]</blank> in 1913",
    );
    expect(view(processCloze(text, 1, "back"))).toBe(
      "<active>Canberra was founded</active> in 1913",
    );
    expect(view(processCloze(text, 2, "front"))).toBe(
      "Canberra was <blank>[...]</blank> in 1913",
    );
  });

  test("inline code with {lang} syntax (triple braces)", () => {
    const text = "Use {{c1::`addEventListener()`{js}}} to bind.";
    expect(view(processCloze(text, 1, "front"))).toBe(
      "Use <blank>[...]</blank> to bind.",
    );
    expect(view(processCloze(text, 1, "back"))).toBe(
      "Use <active>`addEventListener()`{js}</active> to bind.",
    );
  });

  test("destructuring braces inside inline code", () => {
    const text = "{{c1::`const { a, b } = obj`{js}}} works.";
    expect(view(processCloze(text, 1, "front"))).toBe(
      "<blank>[...]</blank> works.",
    );
    expect(view(processCloze(text, 1, "back"))).toBe(
      "<active>`const { a, b } = obj`{js}</active> works.",
    );
  });

  test("inline code with {.lang} syntax inside clozes", () => {
    const text = "Use {{c1::`const x = 1`{.js}}} here.";
    expect(view(processCloze(text, 1, "front"))).toBe(
      "Use <blank>[...]</blank> here.",
    );
    expect(view(processCloze(text, 1, "back"))).toBe(
      "Use <active>`const x = 1`{.js}</active> here.",
    );
  });

  test("inline code with punctuated language tags inside clozes", () => {
    const text = "{{c1::`value`{objective-c}}} and {{c2::`n`{c++}}}.";
    expect(view(processCloze(text, 1, "front"))).toBe(
      "<blank>[...]</blank> and `n`{c++}.",
    );
    expect(view(processCloze(text, 1, "back"))).toBe(
      "<active>`value`{objective-c}</active> and `n`{c++}.",
    );
    expect(view(processCloze(text, 2, "back"))).toBe(
      "`value`{objective-c} and <active>`n`{c++}</active>.",
    );
  });

  test("inactive cloze strips markers", () => {
    const text = "{{c1::HTML}} and {{c2::CSS}}";
    expect(view(processCloze(text, 1, "front"))).toBe(
      "<blank>[...]</blank> and CSS",
    );
    expect(view(processCloze(text, 2, "front"))).toBe(
      "HTML and <blank>[...]</blank>",
    );
  });

  test("adjacent clozes with no space", () => {
    const text = "{{c1::Hello}}{{c2::World}}";
    expect(view(processCloze(text, 1, "front"))).toBe(
      "<blank>[...]</blank>World",
    );
    expect(view(processCloze(text, 2, "front"))).toBe(
      "Hello<blank>[...]</blank>",
    );
  });

  test("block content uses newline-wrapped sentinels", () => {
    const text = "{{c1::line1\nline2}}";
    const result = view(processCloze(text, 1, "back"));
    expect(result).toBe("\n\n<active>\n\nline1\nline2\n\n</active>\n\n");
  });

  test("blur with inline code and {lang}", () => {
    const text = "Use {{c1::`const MAX: u32 = 100`{rust}::blur}}.";
    expect(view(processCloze(text, 1, "front"))).toBe(
      "Use <blur>`const MAX: u32 = 100`{rust}</blur>.",
    );
    expect(view(processCloze(text, 1, "back"))).toBe(
      "Use <reveal>`const MAX: u32 = 100`{rust}</reveal>.",
    );
  });

  test("three cloze numbers", () => {
    const text = "{{c1::A}}-{{c2::B}}-{{c3::C}}";
    expect(view(processCloze(text, 2, "front"))).toBe(
      "A-<blank>[...]</blank>-C",
    );
  });

  // Upstream Anki `main` supports `{{c1,2::...}}`, but released Anki 25.09 does not yet.
  test("supports comma-separated ordinals", () => {
    const text = "{{c1,2::answer}}";
    expect(view(processCloze(text, 1, "front"))).toBe("<blank>[...]</blank>");
    expect(view(processCloze(text, 2, "front"))).toBe("<blank>[...]</blank>");
    expect(view(processCloze(text, 2, "back"))).toBe("<active>answer</active>");
  });

  test("treats single-line block markdown as block content", () => {
    expect(view(processCloze("{{c1::# Heading}}", 1, "back"))).toBe(
      "\n\n<active>\n\n# Heading\n\n</active>\n\n",
    );
    expect(view(processCloze("{{c1::- item}}", 1, "back"))).toBe(
      "\n\n<active>\n\n- item\n\n</active>\n\n",
    );
    expect(view(processCloze("{{c1::> quote}}", 1, "back"))).toBe(
      "\n\n<active>\n\n> quote\n\n</active>\n\n",
    );
  });

  test("no cloze markers passes through unchanged", () => {
    const text = "Just plain text.";
    expect(processCloze(text, 1, "front")).toBe("Just plain text.");
  });
});

describe("postProcessCloze", () => {
  test("upgrades block sentinels into wrapper divs", () => {
    expect(
      postProcessCloze("<p>\uE004</p><p>line</p><p>\uE005</p>"),
    ).toBe('<div class="cloze-active"><p>line</p></div>');
  });
});

describe("renderCloze", () => {
  test("preserves leading whitespace in Extra", async () => {
    const dom = mount();
    const out = markdown();
    const log = console.log;
    console.log = () => {};

    try {
      const { renderCloze } = await loadRender();
      const extra = "    code";
      await renderCloze("{{c1::answer}}", extra, 1, "back");
      expect(dom.back.innerHTML).toBe(out.render(extra));
    } finally {
      console.log = log;
      dom.restore();
    }
  });
});

describe("render", () => {
  test("parses punctuated inline code language tags", async () => {
    const dom = mount();
    const log = console.log;
    console.log = () => {};

    try {
      const { render } = await loadRender();
      await render("Use `value`{objective-c} and `name`{.c++}.", "");
      expect(dom.front.innerHTML).toContain("<code>value</code>");
      expect(dom.front.innerHTML).toContain("<code>name</code>");
      expect(dom.front.innerHTML).not.toContain("{objective-c}");
      expect(dom.front.innerHTML).not.toContain("{.c++}");
    } finally {
      console.log = log;
      dom.restore();
    }
  });

  test("does not treat literal double braces as a language tag", async () => {
    const dom = mount();
    const log = console.log;
    console.log = () => {};

    try {
      const { render } = await loadRender();
      await render("Use `value`{{c1::answer}} here.", "");
      expect(dom.front.innerHTML).toContain("<code>value</code>{{c1::answer}}");
    } finally {
      console.log = log;
      dom.restore();
    }
  });
});
