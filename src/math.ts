import type { MarkdownExit, Token } from "markdown-exit";
import { mathCloze } from "./cloze";

function end(text: string, start: number, limit: number): number {
  const opening = text.slice(start, start + 2);
  const closing = opening === "\\(" ? "\\)" : opening === "\\[" ? "\\]" : "";
  if (!closing) return -1;

  for (let at = start + 2; at < limit - 1; at++) {
    if (text[at] !== "\\") continue;
    if (text.startsWith(closing, at)) return at + 2;
    at++;
  }
  return -1;
}

/** Keep native Anki math opaque to Markdown; Anki supplies the typesetter. */
export function math(md: MarkdownExit) {
  md.inline.ruler.before("escape", "math", (state, silent) => {
    const stop = end(state.src, state.pos, state.posMax);
    if (stop < 0) return false;
    if (!silent) {
      const token = state.push("math", "span", 0);
      token.content = state.src.slice(state.pos, stop);
    }
    state.pos = stop;
    return true;
  });

  md.core.ruler.before("block", "math-cloze", (state) => {
    if (!state.src.includes("\\(") && !state.src.includes("\\[")) return;
    const padding = /\n\n([\uE002-\uE007])\n\n/g;
    if (!padding.test(state.src)) return;

    // Label generated paragraph breaks while finding which ones fall inside math.
    // Real block and inline parsing keeps code, paragraphs, and table cells separate.
    const source = state.src.replace(padding, (_, _marker, at: number) => `\uE008${at}\uE009`);
    const blocks: Token[] = [];
    const env = { ...state.env };
    md.block.parse(source, md, env, blocks);
    const positions = new Set<number>();
    for (const block of blocks) {
      const tokens: Token[] = [];
      if (block.type === "inline") md.inline.parse(block.content, md, env, tokens);
      else if (block.type === "math") tokens.push(block);
      for (const token of tokens) {
        if (token.type !== "math") continue;
        for (const match of token.content.matchAll(/\uE008(\d+)\uE009/g)) positions.add(Number(match[1]));
      }
    }
    state.src = state.src.replace(padding, (text, marker: string, at: number) => (positions.has(at) ? marker : text));
  });

  md.block.ruler.before(
    "fence",
    "math",
    (state, start, limit, silent) => {
      if (state.sCount[start] - state.blkIndent >= 4) return false;
      const at = state.bMarks[start] + state.tShift[start];
      if (!state.src.startsWith("\\[", at)) return false;
      const stop = end(state.src, at, state.bMarks[limit] ?? state.src.length);
      if (stop < 0) return false;

      let line = start;
      while (state.eMarks[line] < stop) {
        line++;
        if (state.bMarks[line] < state.eMarks[line] && state.sCount[line] < state.blkIndent) return false;
      }
      if (state.src.slice(stop, state.eMarks[line]).trim()) return false;
      if (silent) return true;

      const token = state.push("math", "div", 0);
      token.block = true;
      token.content = state.getLines(start, line + 1, state.blkIndent, false).trim();
      token.map = [start, line + 1];
      state.line = line + 1;
      return true;
    },
    { alt: ["paragraph"] },
  );

  md.renderer.rules.math = (tokens, index) => {
    const token = tokens[index];
    const tag = token.block ? "div" : "span";
    return `<${tag} class="math">${md.utils.escapeHtml(mathCloze(token.content))}</${tag}>`;
  };
}

interface MathJax {
  startup: { promise: Promise<unknown> };
  typesetPromise: (elements: HTMLElement[]) => Promise<unknown>;
}

/** Hosts with update hooks typeset after rendering. Other hosts need an explicit pass. */
export async function typeset(wrapper: HTMLElement | null) {
  const host = globalThis as typeof globalThis & { MathJax?: MathJax; onUpdateHook?: unknown[] };
  const engine = host.MathJax;
  if (host.onUpdateHook || !engine?.startup?.promise || !wrapper?.querySelector(".math")) return;

  engine.startup.promise = engine.startup.promise
    .then(() => {
      if (wrapper.isConnected) return engine.typesetPromise([wrapper]);
    })
    .catch(() => console.log("[anki-md] Failed to typeset math"));
  await engine.startup.promise;
}
