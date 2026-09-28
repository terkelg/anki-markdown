import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { typeset } from "../src/math";

interface Host {
  MathJax?: {
    startup: { promise: Promise<unknown> };
    typesetPromise: (elements: HTMLElement[]) => Promise<unknown>;
  };
  onUpdateHook?: unknown[];
}

const host = globalThis as typeof globalThis & Host;
let previous: Host;

beforeEach(() => {
  previous = { MathJax: host.MathJax, onUpdateHook: host.onUpdateHook };
  delete host.MathJax;
  delete host.onUpdateHook;
});

afterEach(() => {
  if (previous.MathJax) host.MathJax = previous.MathJax;
  else delete host.MathJax;
  if (previous.onUpdateHook) host.onUpdateHook = previous.onUpdateHook;
  else delete host.onUpdateHook;
});

function wrapper() {
  const state = { isConnected: true, querySelector: () => ({}) };
  return {
    element: state as unknown as HTMLElement,
    detach: () => (state.isConnected = false),
  };
}

describe("typeset", () => {
  test("uses the host pass when update hooks exist, and otherwise waits for startup", async () => {
    const startup = Promise.withResolvers<void>();
    const calls: HTMLElement[][] = [];
    const card = wrapper();
    host.MathJax = {
      startup,
      typesetPromise: async (elements) => {
        calls.push(elements);
      },
    };

    host.onUpdateHook = [];
    await typeset(card.element);
    expect(calls).toHaveLength(0);

    delete host.onUpdateHook;
    const pending = typeset(card.element);
    expect(calls).toHaveLength(0);
    startup.resolve();
    await pending;
    expect(calls).toEqual([[card.element]]);
  });

  test("skips a detached card without blocking the next queued card", async () => {
    const startup = Promise.withResolvers<void>();
    const calls: HTMLElement[][] = [];
    const front = wrapper();
    const back = wrapper();
    host.MathJax = {
      startup,
      typesetPromise: async (elements) => {
        calls.push(elements);
      },
    };

    const pending = [typeset(front.element), typeset(back.element)];
    front.detach();
    expect(calls).toHaveLength(0);
    startup.resolve();
    await Promise.all(pending);
    expect(calls).toEqual([[back.element]]);
  });

  test("a failed typeset does not poison the queue for the next card", async () => {
    const calls: HTMLElement[][] = [];
    const front = wrapper();
    const back = wrapper();
    host.MathJax = {
      startup: { promise: Promise.resolve() },
      typesetPromise: async (elements) => {
        calls.push(elements);
        if (calls.length === 1) throw new Error("Typesetting failed");
      },
    };
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      await Promise.all([typeset(front.element), typeset(back.element)]);
      expect(calls).toEqual([[front.element], [back.element]]);
    } finally {
      log.mockRestore();
    }
  });
});
