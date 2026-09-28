import { describe, expect, test } from "bun:test";
import { createMarkdownExit } from "markdown-exit";
import { processCloze, postProcessCloze } from "../src/cloze";
import { math } from "../src/math";

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

  test("lets display math interrupt prose, including in lists and blockquotes", () => {
    for (const equation of ["\\[\na\n- b\n\\]", "\\[\na\n\n- b\n\\]"]) {
      for (const text of [
        `Evaluate:\n${equation}`,
        `- Evaluate:\n${equation
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n")}`,
        `> Evaluate:\n${equation
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n")}`,
      ]) {
        expect(md.render(text)).toContain(`<div class="math">${equation}</div>`);
        expect(md.render(text)).not.toContain("<li>b");
      }
    }
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
    expect(cloze(text, "front")).toContain(String.raw`\(x + [...]\)`);
    expect(cloze(text, "back")).toBe(md.render(String.raw`\(x + y\)`));
    expect(cloze(text, "back")).not.toMatch(/[\uE000-\uE007]/);
  });

  test("uses native TeX hints and a blank for blur inside equations", () => {
    expect(cloze(String.raw`\(x + {{c1::y::a_b < c}}\)`, "front")).toContain(String.raw`\(x + [a_b &lt; c]\)`);
    expect(cloze(String.raw`\(x + {{c1::y::blur}}\)`, "front")).toBe(cloze(String.raw`\(x + {{c1::y}}\)`, "front"));
    expect(cloze(String.raw`\(x + {{c1::y::blur}}\)`, "back")).toBe(md.render(String.raw`\(x + y\)`));
  });

  test("preserves TeX commands and text mode without inserting groups", () => {
    for (const text of [String.raw`\({{c1::\frac}}{a}{b}\)`, String.raw`\({{c1::\frac::blur}}{a}{b}\)`])
      expect(cloze(text, "back")).toBe(md.render(String.raw`\(\frac{a}{b}\)`));
    for (const hint of ["", "::blur", "::speed"]) {
      const text = String.raw`\(\text{ {{c1::velocity${hint}}} }\)`;
      expect(cloze(text, "front")).toBe(md.render(String.raw`\(\text{ [${hint === "::speed" ? "speed" : "..."}] }\)`));
      expect(cloze(text, "back")).toBe(md.render(String.raw`\(\text{ velocity }\)`));
    }
    expect(cloze(String.raw`\(\left({{c1::x\right)::blur}}\)`, "back")).toBe(md.render(String.raw`\(\left(x\right)\)`));
  });

  test.each(["- b", "b\n+c"])("keeps the cloze %j inside inline math when revealed or blurred", (body) => {
    expect(cloze(`\\(a + {{c1::${body}}}\\)`, "back")).toContain(`\\(a + ${body}\\)</span>`);
    expect(cloze(`\\(a + {{c1::${body}::blur}}\\)`, "front")).toContain(String.raw`\(a + [...]\)</span>`);
    expect(cloze(`\\(a + {{c1::${body}::blur}}\\)`, "back")).toContain(`\\(a + ${body}\\)</span>`);
  });

  test.each([String.raw`a &= b`, String.raw`a \\ b`])(
    "hides alignment-spanning clozes without TeX groups: %s",
    (body) => {
      for (const hint of ["", "::blur"]) {
        const text = String.raw`\[\begin{aligned}{}{{c1::${body}${hint}}}\end{aligned}\]`;
        const front = cloze(text, "front");
        expect(front).toContain("[...]");
        expect(front).not.toContain(body);
        expect(cloze(text, "back")).toBe(md.render(String.raw`\[\begin{aligned}{}${body}\end{aligned}\]`));
      }
    },
  );

  test("keeps blur around a whole equation", () => {
    expect(cloze(String.raw`{{c1::\[\begin{aligned}a &= b\end{aligned}\]::blur}}`, "front")).toContain(
      String.raw`<span class="cloze-blur"><span class="math">\[\begin{aligned}a &amp;= b\end{aligned}\]</span></span>`,
    );
  });

  test("preserves Markdown block clozes and literal math delimiters in code", () => {
    expect(cloze("Opening: {{c1::`\\(`}}. Closing: `\\)`.", "front")).toBe(
      '<p>Opening: <span class="cloze-blank">[...]</span>. Closing: <code>\\)</code>.</p>\n',
    );
    expect(cloze("`\\(` {{c1::- item}} `\\)`", "back")).toContain(
      '<div class="cloze-active">\n<ul>\n<li>item</li>\n</ul>\n</div>',
    );
  });

  test("keeps unrelated backticks and code blocks out of math cloze layout", () => {
    const equation = String.raw`\(a + {{c1::- b::blur}}\)`;
    for (const text of [
      `A literal backtick: \`\n\n${equation}\n\nAnother literal backtick: \``,
      `~~~text\n\`\n~~~\n${equation}\n\n\`code\``,
      `    \`\n\n${equation}\n\n\`code\``,
      `\`\`\`text\n\`\n\`\`\`\`\n${equation}\n\n\`code\``,
    ]) {
      expect(cloze(text, "front")).toContain(String.raw`\(a + [...]\)</span>`);
      expect(cloze(text, "back")).toContain(String.raw`\(a + - b\)</span>`);
    }
  });

  test("keeps math cloze layout within blockquotes, lists, links, and table rows", () => {
    const equation = String.raw`\(a + {{c1::- b::blur}}\)`;
    for (const text of [
      `> ${equation}`,
      `- ${equation}`,
      `[${equation}](https://example.com)`,
      `λ 😀 ${equation}`,
      `| A | B |\n| - | - |\n| ${equation} | ${equation} |`,
      `| A | B | C |\n| - | - | - |\n| \` | ${equation} | \` |`,
    ]) {
      for (const side of ["front", "back"] as const) {
        const html = cloze(text, side);
        expect(html).toContain(side === "front" ? String.raw`\(a + [...]\)</span>` : String.raw`\(a + - b\)</span>`);
        expect(html).not.toContain("<li>b");
        expect(html.match(/class="math"/g)).toHaveLength(text.match(/\{\{c1::/g)!.length);
      }
    }
  });

  test("leaves ordinary Markdown and literal TeX code unchanged when clozes add block spacing", () => {
    const plain = createMarkdownExit();
    for (const text of [
      "{{c1::# Heading}}",
      "{{c1::- first\n- second}}",
      "{{c1::paragraph\n\nnext}}",
      "{{c1::```tex\n\\(x\\)\n```}}",
      "{{c1::~~~tex\n\\(x\\)\n~~~}}",
      "```tex\n\\( {{c1::- b}} \\)\n```",
      "~~~tex\n\\( {{c1::- b}} \\)\n~~~",
    ]) {
      for (const side of ["front", "back"] as const) {
        const source = processCloze(text, 1, side);
        expect(md.render(source)).toBe(plain.render(source));
      }
    }
  });

  test("keeps nested TeX braces separated for native cloze compatibility", () => {
    const text = String.raw`{{c1::\(\frac{1}{\sqrt{2} }\)}}`;
    expect(cloze(text, "front")).toBe('<p><span class="cloze-blank">[...]</span></p>\n');
    expect(cloze(text, "back")).toContain(String.raw`\(\frac{1}{\sqrt{2} }\)`);
    const inner = String.raw`\(x + {{c1::\frac{1}{\sqrt{2} } }}\)`;
    expect(cloze(inner, "front")).toBe(md.render(String.raw`\(x + [...]\)`));
    expect(cloze(inner, "back")).toBe(md.render(String.raw`\(x + \frac{1}{\sqrt{2} } \)`));
  });

  test("still processes nested clozes inside an equation wrapped in a cloze", () => {
    const text = String.raw`{{c1::\(a + {{c2::b}} + \frac{1}{\sqrt{2} }\)}}`;
    expect(cloze(text, "front", 2)).toContain(String.raw`\(a + [...] + \frac{1}{\sqrt{2} }\)`);
    expect(cloze(text, "back", 2)).toBe(md.render(String.raw`\(a + b + \frac{1}{\sqrt{2} }\)`));
  });
});
