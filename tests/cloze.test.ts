import { describe, expect, test } from "bun:test";
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
