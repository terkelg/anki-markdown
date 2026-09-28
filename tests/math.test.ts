import { describe, expect, test } from "bun:test";
import { createMarkdownExit } from "markdown-exit";
import { processCloze, postProcessCloze } from "../src/cloze";
import { math, typeset } from "../src/math";

const md = createMarkdownExit().use(math);

function cloze(text: string, side: "front" | "back", ord = 1) {
  return postProcessCloze(md.render(processCloze(text, ord, side)));
}

describe("math", () => {
  test("preserves TeX and escapes HTML without parsing Markdown inside it", () => {
    const text = String.raw`Before \(a_i * b_j < c & \text{**literal**}\) after.`;
    expect(md.render(text)).toBe(
      '<p>Before <span class="math">\\(a_i * b_j &lt; c &amp; \\text{**literal**}\\)</span> after.</p>\n',
    );
  });

  test("preserves display math across blank lines", () => {
    const text = String.raw`\[
\begin{aligned}
a &= b \\

c &= d
\end{aligned}
\]`;
    expect(md.render(text)).toBe(`<div class="math">${md.utils.escapeHtml(text)}</div>`);
  });

  test("keeps display math inside lists and blockquotes", () => {
    expect(md.render("> \\[\n> x_i\n> \\]")).toContain('<div class="math">\\[\nx_i\n\\]</div>');
    expect(md.render("- \\[\n  x_i\n  \\]")).toContain('<div class="math">\\[\nx_i\n\\]</div>');
    expect(md.render("- \\[\n  x_i\n\n  + y_i\n  \\]")).toContain('<div class="math">\\[\nx_i\n\n+ y_i\n\\]</div>');
  });

  test("leaves code, dollar syntax and unmatched delimiters to Markdown", () => {
    for (const text of [String.raw`\(x`, "$x$", "    \\[x\\]", "```tex\n\\(x\\)\n```"])
      expect(md.render(text)).not.toContain('class="math"');
    expect(md.render("`\\(x\\)`")).toBe("<p><code>\\(x\\)</code></p>\n");
  });

  test("does not mistake a TeX line break for the closing delimiter", () => {
    expect(md.render(String.raw`\(a \\) b\)`)).toContain(String.raw`\(a \\) b\)</span>`);
  });

  test("supports a cloze within an equation on both sides", () => {
    const text = String.raw`\(x + {{c1::y}}\)`;
    expect(cloze(text, "front")).toContain(String.raw`\(x + \class{cloze-blank}{\text{[...]}}\)`);
    expect(cloze(text, "back")).toContain(String.raw`\(x + \class{cloze-active}{y}\)`);
    expect(cloze(text, "back")).not.toMatch(/[\uE000-\uE007]/);
  });

  test("preserves hint text and blur/reveal groups inside equations", () => {
    expect(cloze(String.raw`\(x + {{c1::y::a_b & c}}\)`, "front")).toContain(String.raw`\text{[a_b &amp; c]}`);
    expect(cloze(String.raw`\(x + {{c1::y::blur}}\)`, "front")).toContain(String.raw`\class{cloze-blur}{y}`);
    expect(cloze(String.raw`\(x + {{c1::y::blur}}\)`, "back")).toContain(
      String.raw`\class{cloze-active cloze-reveal}{y}`,
    );
  });

  test("keeps nested TeX braces inside a cloze around an equation", () => {
    const text = String.raw`{{c1::\(\frac{1}{\sqrt{2}}\)}}`;
    expect(cloze(text, "front")).toBe('<p><span class="cloze-blank">[...]</span></p>\n');
    expect(cloze(text, "back")).toContain(String.raw`\(\frac{1}{\sqrt{2}}\)`);
  });

  test("still processes nested clozes inside an equation wrapped in a cloze", () => {
    const text = String.raw`{{c1::\(a + {{c2::b}} + \frac{1}{\sqrt{2}}\)}}`;
    expect(cloze(text, "front", 2)).toContain(
      String.raw`\(a + \class{cloze-blank}{\text{[...]}} + \frac{1}{\sqrt{2}}\)`,
    );
    expect(cloze(text, "back", 2)).toContain(String.raw`\class{cloze-active}{b}`);
  });

  test("preserves readable cloze styling without MathJax", () => {
    const text = processCloze(String.raw`\(x + {{c1::y::blur}}\)`, 1, "front");
    expect(md.render(text, { math: false })).toBe(
      '<p><span class="math">\\(x + <span class="cloze-blur">y</span>\\)</span></p>\n',
    );
  });
});

describe("typeset", () => {
  test("uses the host pass when update hooks exist, and otherwise waits for startup", async () => {
    const host = globalThis as any;
    const previous = { engine: host.MathJax, hooks: host.onUpdateHook };
    const calls: HTMLElement[][] = [];
    const wrapper = { isConnected: true, querySelector: () => ({}) } as unknown as HTMLElement;
    let ready!: () => void;
    host.MathJax = {
      startup: { promise: new Promise<void>((resolve) => (ready = resolve)) },
      typesetPromise: async (elements: HTMLElement[]) => {
        calls.push(elements);
      },
    };
    try {
      host.onUpdateHook = [];
      await typeset(wrapper);
      expect(calls).toHaveLength(0);
      delete host.onUpdateHook;
      const pending = typeset(wrapper);
      expect(calls).toHaveLength(0);
      ready();
      await pending;
      expect(calls).toEqual([[wrapper]]);
    } finally {
      host.MathJax = previous.engine;
      host.onUpdateHook = previous.hooks;
    }
  });
});
