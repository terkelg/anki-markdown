export type Side = "front" | "back";

type Node = string | Tag;

interface Tag {
  body: Node[];
  hint?: string;
  ords: number[];
}

const BLANK_OPEN = "\uE000";
const BLANK_CLOSE = "\uE001";
const BLUR_OPEN = "\uE002";
const BLUR_CLOSE = "\uE003";
const ACTIVE_OPEN = "\uE004";
const ACTIVE_CLOSE = "\uE005";
const REVEAL_OPEN = "\uE006";
const REVEAL_CLOSE = "\uE007";
const BLOCK =
  /^(?: {0,3}(?:#{1,6}(?:\s|$)|[-+*]\s|>\s?|```|~~~|\d+[.)]\s)|(?: {4}|\t)\S)/;

function push(list: Node[], text: string) {
  if (text) list.push(text);
}

function nums(text: string): number[] {
  return [...new Set(text.split(",").flatMap((item) => {
    if (!item) return [];
    const num = Number.parseInt(item, 10);
    return Number.isNaN(num) ? [] : [num];
  }))];
}

function wrap(text: string, start: string, end: string): string {
  if (text.includes("\n") || BLOCK.test(text)) {
    return `\n\n${start}\n\n${text}\n\n${end}\n\n`;
  }
  return `${start}${text}${end}`;
}

function parseTag(text: string, at: number): [Tag, number] | null {
  if (!text.startsWith("{{c", at)) return null;

  let i = at + 3;
  let num = "";
  while (i < text.length) {
    const ch = text[i];
    if ((ch < "0" || ch > "9") && ch !== ",") break;
    num += ch;
    i++;
  }

  const ords = nums(num);
  if (!ords.length || !text.startsWith("::", i)) return null;
  i += 2;

  const body: Node[] = [];
  let buf = "";
  let hint = "";
  let seen = false;

  while (i < text.length) {
    if (!seen) {
      const tag = parseTag(text, i);
      if (tag) {
        push(body, buf);
        buf = "";
        body.push(tag[0]);
        i = tag[1];
        continue;
      }

      if (text.startsWith("::", i)) {
        push(body, buf);
        buf = "";
        seen = true;
        i += 2;
        continue;
      }
    }

    if (text.startsWith("}}", i)) {
      // Skip }} when followed by } and body ends with unclosed {word pattern
      // (handles `code`{js}}} where } closes {lang} and }} closes cloze)
      if (text[i + 2] === "}" && /\{\w+$/.test(seen ? hint : buf)) {
        if (seen) hint += text[i];
        else buf += text[i];
        i++;
        continue;
      }
      if (!seen) push(body, buf);
      return [
        { body, hint: seen ? hint : undefined, ords },
        i + 2,
      ];
    }

    if (seen) hint += text[i];
    else buf += text[i];
    i++;
  }

  return null;
}

function parse(text: string): Node[] {
  const out: Node[] = [];
  let buf = "";
  let i = 0;

  while (i < text.length) {
    const tag = parseTag(text, i);
    if (!tag) {
      buf += text[i];
      i++;
      continue;
    }

    push(out, buf);
    buf = "";
    out.push(tag[0]);
    i = tag[1];
  }

  push(out, buf);
  return out;
}

function show(list: Node[], ord: number, side: Side, skip?: number): string {
  let out = "";
  for (const node of list) {
    if (typeof node === "string") {
      out += node;
      continue;
    }

    const live = node.ords.includes(ord) && ord !== skip;
    if (!live) {
      out += show(node.body, ord, side, skip);
      continue;
    }

    if (side === "front") {
      if (node.hint === "blur") {
        out += wrap(show(node.body, ord, side, ord), BLUR_OPEN, BLUR_CLOSE);
      } else {
        out += node.hint
          ? `${BLANK_OPEN}[${node.hint}]${BLANK_CLOSE}`
          : `${BLANK_OPEN}[...]${BLANK_CLOSE}`;
      }
      continue;
    }

    const body = show(node.body, ord, side, ord);
    out += node.hint === "blur"
      ? wrap(body, REVEAL_OPEN, REVEAL_CLOSE)
      : wrap(body, ACTIVE_OPEN, ACTIVE_CLOSE);
  }

  return out;
}

export function processCloze(text: string, ord: number, side: Side): string {
  return show(parse(text), ord, side);
}

export function postProcessCloze(html: string): string {
  return html
    .replaceAll("<p>\uE002</p>", '<div class="cloze-blur">')
    .replaceAll("<p>\uE003</p>", "</div>")
    .replaceAll("<p>\uE004</p>", '<div class="cloze-active">')
    .replaceAll("<p>\uE005</p>", "</div>")
    .replaceAll("<p>\uE006</p>", '<div class="cloze-active cloze-reveal">')
    .replaceAll("<p>\uE007</p>", "</div>")
    .replaceAll("\uE000", '<span class="cloze-blank">')
    .replaceAll("\uE001", "</span>")
    .replaceAll("\uE002", '<span class="cloze-blur">')
    .replaceAll("\uE003", "</span>")
    .replaceAll("\uE004", '<span class="cloze-active">')
    .replaceAll("\uE005", "</span>")
    .replaceAll("\uE006", '<span class="cloze-active cloze-reveal">')
    .replaceAll("\uE007", "</span>");
}
