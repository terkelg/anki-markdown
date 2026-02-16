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

export interface Config {
  languages: string[];
  availableLanguages?: string[];
  themes: { light: string; dark: string };
  cardless: boolean;
}

const BUILTIN_TEXT_LANGS = new Set(["text", "txt", "plain", "plaintext"]);

function isBuiltinTextLanguage(name: string): boolean {
  return BUILTIN_TEXT_LANGS.has(name.toLowerCase());
}

const DEFAULT_CONFIG: Config = {
  // No config means no explicit language modules; render falls back to plain code.
  languages: [],
  availableLanguages: [],
  themes: { light: "vitesse-light", dark: "vitesse-dark" },
  cardless: false,
};

const ALLOWED = /^<\/?(img|a|b|i|em|strong|br|kbd)(\s[^>]*)?>$/i;
const sanitize = (html: string) => (ALLOWED.test(html.trim()) ? html : "");
const decoder = document.createElement("textarea");

function normalizeConfig(config?: Partial<Config>): Config {
  const normalizedLanguages = Array.from(
    new Set(
      (config?.languages ?? [])
        .map((lang) => lang?.trim())
        .filter((lang): lang is string => !!lang),
    ),
  );
  const availableLanguages = Array.from(
    new Set(
      (config?.availableLanguages ?? [])
        .map((lang) => lang?.trim())
        .filter((lang): lang is string => !!lang),
    ),
  );

  if (!config) return DEFAULT_CONFIG;
  return {
    languages: normalizedLanguages.length
      ? normalizedLanguages
      : DEFAULT_CONFIG.languages,
    availableLanguages,
    themes: {
      light: config.themes?.light ?? DEFAULT_CONFIG.themes.light,
      dark: config.themes?.dark ?? DEFAULT_CONFIG.themes.dark,
    },
    cardless: config.cardless ?? DEFAULT_CONFIG.cardless,
  };
}

export function readConfig(id = "anki-md-config"): Config {
  const el = document.getElementById(id);

  try {
    if (el?.textContent) {
      return normalizeConfig(JSON.parse(el.textContent));
    }

    const globalConfig = (globalThis as { ankiMdConfig?: Partial<Config> })
      .ankiMdConfig;
    if (globalConfig) {
      return normalizeConfig(globalConfig);
    }

    return DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function decodeField(text: string): string {
  decoder.innerHTML = text.replace(/<br\s*\/?>/gi, "\n");
  return decoder.value;
}

export class MarkdownRenderer {
  readonly config: Config;

  private readonly themes: Config["themes"];
  private readonly assetBase: string;
  private readonly md: MarkdownIt;
  private readonly transformers = [
    transformerMetaHighlight(),
    transformerMetaWordHighlight(),
    transformerNotationErrorLevel({ matchAlgorithm: "v3" }),
    transformerNotationFocus({ matchAlgorithm: "v3" }),
  ];
  private readonly boundRoots = new WeakSet<HTMLElement>();

  private highlighter?: HighlighterCore;
  private highlighterReady!: Promise<void>;

  constructor(options: { config?: Partial<Config>; assetBase?: string } = {}) {
    this.config = normalizeConfig(options.config);
    this.themes = this.config.themes;
    this.assetBase = options.assetBase ?? "./";

    this.md = MarkdownIt({ html: true }).use(mark).use(alerts);
    this.md.renderer.rules.html_inline = (tokens, idx) =>
      sanitize(tokens[idx].content);
    this.md.renderer.rules.html_block = (tokens, idx) => sanitize(tokens[idx].content);

    this.md.renderer.rules.fence = (tokens, idx) => {
      const { content, info } = tokens[idx];
      const [lang, ...rest] = info.split(/\s+/);
      return this.highlight(content.trimEnd(), lang || "text", rest.join(" "));
    };

    this.md.core.ruler.after("inline", "inline-code-lang", (state) => {
      for (const token of state.tokens) {
        if (token.type !== "inline" || !token.children) continue;
        for (let i = 0; i < token.children.length; i++) {
          if (token.children[i].type !== "code_inline") continue;
          const next = token.children[i + 1];
          if (next?.type !== "text") continue;
          const match = next.content.match(/^\{\.?([\w-]+)\}(.*)$/);
          if (!match) continue;
          const [, lang, rest] = match;
          token.children[i].meta = { lang };
          next.content = rest;
          if (!rest) token.children.splice(i + 1, 1);
        }
      }
    });

    this.md.renderer.rules.code_inline = (tokens, idx) => {
      const { content, meta } = tokens[idx];
      if (meta?.lang && this.highlighter) {
        const lang = String(meta.lang).toLowerCase();
        if (this.highlighter.getLoadedLanguages().includes(lang)) {
          try {
            return this.highlighter.codeToHtml(content, {
              lang,
              themes: this.themes,
              defaultColor: false,
              transformers: [codeInline],
            });
          } catch {
            /* fall through */
          }
        }
      }
      return `<code>${this.md.utils.escapeHtml(content)}</code>`;
    };

    this.startHighlighterInit();
  }

  async render(text: string): Promise<string> {
    await this.highlighterReady;
    return this.md.render(decodeField(text));
  }

  attachCodeBlockHandlers(root: HTMLElement): void {
    if (this.boundRoots.has(root)) return;
    this.boundRoots.add(root);

    if (navigator.clipboard) {
      root.classList.add("clipboard");
    }

    root.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const block = target.closest(".code-block");
      if (!block || !root.contains(block)) return;

      const toggle = target.closest(".toggle") as HTMLElement | null;
      if (toggle) {
        const revealed = block.classList.toggle("revealed");
        toggle.textContent = revealed ? "Hide" : "Reveal";
      }

      const copy = target.closest(".copy") as HTMLElement | null;
      if (copy) {
        navigator.clipboard.writeText(block.querySelector("code")?.textContent || "");
        copy.textContent = "Copied";
        setTimeout(() => {
          copy.textContent = "Copy";
        }, 1500);
      }
    });
  }

  private async initHighlighter(): Promise<HighlighterCore> {
    const [langs, themeList] = await Promise.all([
      this.loadLanguages(),
      this.loadThemes(),
    ]);

    return createHighlighterCore({
      langs,
      themes: themeList,
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
  }

  private async loadLanguages(): Promise<LanguageRegistration[]> {
    let names = this.config.languages.filter(
      (name) => !isBuiltinTextLanguage(name),
    );
    if (Array.isArray(this.config.availableLanguages)) {
      const available = new Set(
        this.config.availableLanguages.map((name) => name.toLowerCase()),
      );
      names = names.filter((name) => available.has(name.toLowerCase()));
    }
    if (!names.length) return [];

    const results = await Promise.allSettled(
      names.map((name) =>
        import(/* @vite-ignore */ `${this.assetBase}_lang-${name}.js`),
      ),
    );

    return results.flatMap((r, i) => {
      if (r.status === "fulfilled") return [r.value.default].flat();
      console.log(`[anki-md] Failed to load language: ${names[i]}`);
      return [];
    });
  }

  private async loadThemes(): Promise<ThemeRegistration[]> {
    const names = [...new Set([this.themes.light, this.themes.dark])];
    const results = await Promise.allSettled(
      names.map((name) => import(/* @vite-ignore */ `${this.assetBase}_theme-${name}.js`)),
    );

    return results.flatMap((r, i) => {
      if (r.status === "fulfilled") return [r.value.default];
      console.log(`[anki-md] Failed to load theme: ${names[i]}`);
      return [];
    });
  }

  private highlight(code: string, lang: string, meta?: string): string {
    if (!this.highlighter) {
      return `<pre><code>${this.md.utils.escapeHtml(code)}</code></pre>`;
    }

    lang = lang.toLowerCase();
    if (!this.highlighter.getLoadedLanguages().includes(lang)) {
      lang = "text";
    }

    try {
      return this.highlighter.codeToHtml(code, {
        lang,
        themes: this.themes,
        meta: { __raw: meta },
        defaultColor: false,
        transformers: [...this.transformers, codeBlock],
      });
    } catch {
      return this.highlighter.codeToHtml(code, {
        lang: "text",
        themes: this.themes,
        defaultColor: false,
        transformers: [codeBlock],
      });
    }
  }

  private startHighlighterInit(): void {
    this.highlighterReady = this.initHighlighter()
      .then((h) => {
        this.highlighter = h;
      })
      .catch((err) => {
        console.log("[anki-md] Failed to initialize syntax highlighter", err);
      });
  }
}

const codeBlock: ShikiTransformer = {
  name: "code-block",
  pre(node) {
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

    Object.assign(node, figure);
  },
};

const codeInline: ShikiTransformer = {
  name: "code-inline",
  pre(node) {
    const classes = [node.properties.class].flat().filter(Boolean) as string[];
    node.tagName = "code";
    node.properties.class = ["code-inline", ...classes];
    const inner = node.children[0] as Element;
    if (inner?.tagName === "code") {
      node.children = inner.children;
    }
  },
};
