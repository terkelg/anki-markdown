import "./style.css";
import MarkdownIt from "markdown-it";
import mark from "markdown-it-mark";
import alerts from "markdown-it-github-alerts";
import { createHighlighterCore } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import type {
  HighlighterCore,
  LanguageRegistration,
  ThemeRegistration,
} from "@shikijs/core";
import type { ShikiTransformer } from "shiki";
import type { Element } from "hast";
import {
  transformerMetaHighlight,
  transformerMetaWordHighlight,
  transformerNotationErrorLevel,
  transformerNotationFocus,
} from "@shikijs/transformers";

// Config from inline JSON (injected by Python)
interface Config {
  languages: string[];
  themes: { light: string; dark: string };
  cardless: boolean;
}

function getConfig(): Config {
  const el = document.getElementById("anki-md-config");
  if (!el?.textContent) {
    return {
      languages: ["text"],
      themes: { light: "vitesse-light", dark: "vitesse-dark" },
      cardless: false,
    };
  }
  return JSON.parse(el.textContent);
}

const config = getConfig();
const themes = config.themes;

async function loadLanguages(): Promise<LanguageRegistration[]> {
  const results = await Promise.allSettled(
    config.languages.map(
      (name) => import(/* @vite-ignore */ `./_lang-${name}.js`),
    ),
  );
  return results.flatMap((r, i) => {
    if (r.status === "fulfilled") return [r.value.default].flat();
    console.log(`[anki-md] Failed to load language: ${config.languages[i]}`);
    return [];
  });
}

async function loadThemes(): Promise<ThemeRegistration[]> {
  const names = [...new Set([config.themes.light, config.themes.dark])];
  const results = await Promise.allSettled(
    names.map((name) => import(/* @vite-ignore */ `./_theme-${name}.js`)),
  );
  return results.flatMap((r, i) => {
    if (r.status === "fulfilled") return [r.value.default];
    console.log(`[anki-md] Failed to load theme: ${names[i]}`);
    return [];
  });
}

const transformers = [
  transformerMetaHighlight(),
  transformerMetaWordHighlight(),
  transformerNotationErrorLevel({ matchAlgorithm: "v3" }),
  transformerNotationFocus({ matchAlgorithm: "v3" }),
];

let highlighter: HighlighterCore;

async function initHighlighter(): Promise<HighlighterCore> {
  const [langs, themeList] = await Promise.all([loadLanguages(), loadThemes()]);
  return createHighlighterCore({
    langs,
    themes: themeList,
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
}

const highlighterPromise = initHighlighter();
highlighterPromise.then((h) => {
  highlighter = h;
});

const codeBlock: ShikiTransformer = {
  name: "code-block",
  pre(node) {
    // Move shiki class/styles from <pre> to <figure> wrapper
    const lang = this.options.lang;
    const classes = [node.properties.class].flat().filter(Boolean) as string[];
    const style = node.properties.style;

    node.properties = {};

    const figure: Element = {
      type: "element",
      tagName: "figure",
      properties: { class: ["code-block", ...classes], style },
      children: [
        { ...node } as Element,
        {
          type: "element",
          tagName: "figcaption",
          properties: { class: "toolbar" },
          children: [
            {
              type: "element",
              tagName: "span",
              properties: { class: "lang" },
              children: [{ type: "text", value: lang }],
            },
            {
              type: "element",
              tagName: "span",
              properties: { class: "actions" },
              children: [
                {
                  type: "element",
                  tagName: "button",
                  properties: { type: "button", class: "toggle" },
                  children: [{ type: "text", value: "Reveal" }],
                },
                {
                  type: "element",
                  tagName: "button",
                  properties: { type: "button", class: "copy" },
                  children: [{ type: "text", value: "Copy" }],
                },
              ],
            },
          ],
        },
      ],
    };

    // Replace node properties to become the figure
    Object.assign(node, figure);
  },
};

const codeInline: ShikiTransformer = {
  name: "code-inline",
  pre(node) {
    const classes = [node.properties.class].flat().filter(Boolean) as string[];
    node.tagName = "code";
    node.properties.class = ["code-inline", ...classes];
    // Flatten: move inner <code> children up
    const inner = node.children[0] as Element;
    if (inner?.tagName === "code") {
      node.children = inner.children;
    }
  },
};

function highlight(code: string, lang: string, meta?: string) {
  if (!highlighter) {
    const escaped = md.utils.escapeHtml(code);
    const attr = meta ? ` data-meta="${md.utils.escapeHtml(meta)}"` : "";
    return (
      `<figure class="code-block" data-pending${attr}>` +
      `<pre><code>${escaped}</code></pre>` +
      `<figcaption class="toolbar"><span class="lang">${lang}</span>` +
      `<span class="actions">` +
      `<button type="button" class="toggle">Reveal</button>` +
      `<button type="button" class="copy">Copy</button>` +
      `</span></figcaption></figure>`
    );
  }
  if (!highlighter.getLoadedLanguages().includes(lang)) lang = "text";

  try {
    return highlighter.codeToHtml(code, {
      lang,
      themes,
      meta: { __raw: meta },
      defaultColor: false,
      transformers: [...transformers, codeBlock],
    });
  } catch {
    return highlighter.codeToHtml(code, {
      lang: "text",
      themes,
      defaultColor: false,
      transformers: [codeBlock],
    });
  }
}

const md = MarkdownIt({ html: true }).use(mark).use(alerts);

// Only allow safe HTML tags, strip everything else
const ALLOWED = /^<\/?(img|a|b|i|em|strong|br|kbd)(\s[^>]*)?>$/i;
const sanitize = (html: string) => (ALLOWED.test(html.trim()) ? html : "");
md.renderer.rules.html_inline = (tokens, idx) =>
  sanitize(tokens[idx].content);
md.renderer.rules.html_block = (tokens, idx) => sanitize(tokens[idx].content);

// Fence renderer: ```lang meta
md.renderer.rules.fence = (tokens, idx) => {
  const { content, info } = tokens[idx];
  const [lang, ...rest] = info.split(/\s+/);
  return highlight(content.trimEnd(), lang || "text", rest.join(" "));
};

// Inline code: `code`{lang}
md.core.ruler.after("inline", "inline-code-lang", (state) => {
  for (const token of state.tokens) {
    if (token.type !== "inline" || !token.children) continue;
    for (let i = 0; i < token.children.length; i++) {
      if (token.children[i].type !== "code_inline") continue;
      const next = token.children[i + 1];
      if (next?.type !== "text") continue;
      const match = next.content.match(/^\{\.?(\w+)\}(.*)$/);
      if (!match) continue;
      const [, lang, rest] = match;
      token.children[i].meta = { lang };
      next.content = rest;
      if (!rest) token.children.splice(i + 1, 1);
    }
  }
});

md.renderer.rules.code_inline = (tokens, idx) => {
  const { content, meta } = tokens[idx];
  if (meta?.lang && highlighter) {
    if (highlighter.getLoadedLanguages().includes(meta.lang)) {
      try {
        return highlighter.codeToHtml(content, {
          lang: meta.lang,
          themes,
          defaultColor: false,
          transformers: [codeInline],
        });
      } catch {
        /* fall through */
      }
    }
  }
  return `<code>${md.utils.escapeHtml(content)}</code>`;
};

// Event delegation for toolbar
const card = document.querySelector(".card");
if (navigator.clipboard) card?.classList.add("clipboard");

card?.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const block = target.closest(".code-block");
  if (!block) return;

  const toggle = target.closest(".toggle") as HTMLElement;
  if (toggle) {
    const revealed = block.classList.toggle("revealed");
    toggle.textContent = revealed ? "Hide" : "Reveal";
  }
  const copy = target.closest(".copy") as HTMLElement;
  if (copy) {
    navigator.clipboard.writeText(
      block.querySelector("code")?.textContent || "",
    );
    copy.textContent = "Copied";
    setTimeout(() => (copy.textContent = "Copy"), 1500);
  }
});

// Textarea trick: browser decodes all HTML entities when parsing innerHTML
const decoder = document.createElement("textarea");

function decode(text: string): string {
  decoder.innerHTML = text.replace(/<br\s*\/?>/gi, "\n");
  return decoder.value;
}

/**
 * Re-highlight code blocks that were rendered before Shiki was ready.
 * Updates in-place: swaps code innerHTML and copies Shiki attributes
 * onto the existing figure so the outer layout never changes.
 */
function upgradeCodeBlocks(container: HTMLElement) {
  const pending = container.querySelectorAll<HTMLElement>(
    ".code-block[data-pending]",
  );
  for (const figure of pending) {
    const code = figure.querySelector("code");
    if (!code) continue;
    const text = code.textContent || "";
    const lang = figure.querySelector(".lang")?.textContent || "text";
    const meta = figure.dataset.meta;
    const highlighted = highlight(text.replace(/\n$/, ""), lang, meta);
    const tpl = document.createElement("template");
    tpl.innerHTML = highlighted;
    const fresh = tpl.content.firstElementChild as HTMLElement;
    if (!fresh) continue;

    // Swap code content and copy figure attributes in-place
    const inner = fresh.querySelector("code");
    if (inner) code.innerHTML = inner.innerHTML;
    figure.className = fresh.className;
    if (fresh.style.cssText) figure.style.cssText = fresh.style.cssText;
    figure.removeAttribute("data-pending");
    figure.removeAttribute("data-meta");
  }
}

/** Render front/back fields to card DOM. */
export async function render(front: string, back: string) {
  const wrapper = document.querySelector(".anki-md-wrapper");

  // Normalize dark mode classes into .night-mode on :root
  // - Desktop: nightMode + night_mode on <body> (qt/aqt/theme.py body_classes_for_card_ord)
  //   https://github.com/ankitects/anki/blob/main/qt/aqt/theme.py
  // - AnkiDroid: night_mode on <body>
  //   https://github.com/ankidroid/Anki-Android/wiki/Advanced-formatting
  // - AnkiMobile: nightMode on card element
  //   https://docs.ankimobile.net/night-mode.html
  const dark =
    document.body.classList.contains("nightMode") ||
    document.body.classList.contains("night_mode") ||
    matchMedia("(prefers-color-scheme: dark)").matches;
  if (dark) document.documentElement.classList.add("night-mode");

  const frontEl = document.querySelector<HTMLElement>(".front");
  const backEl = document.querySelector<HTMLElement>(".back");

  // Render immediately — if the highlighter isn't ready yet, code blocks
  // will use the plain <pre><code> fallback from highlight().
  if (frontEl) frontEl.innerHTML = md.render(decode(front));
  if (backEl) backEl.innerHTML = md.render(decode(back));
  if (config.cardless) wrapper?.classList.add("cardless");
  wrapper?.classList.add("ready");

  // If we rendered before the highlighter was ready, wait for it
  // then upgrade code blocks in-place with syntax highlighting.
  if (!highlighter) {
    await highlighterPromise;
    if (frontEl) upgradeCodeBlocks(frontEl);
    if (backEl) upgradeCodeBlocks(backEl);
  }
}
