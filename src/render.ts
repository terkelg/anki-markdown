import "./reviewer.css";
import "./markdown-rendered.css";
import { MarkdownRenderer, readConfig } from "./markdown";

const renderer = new MarkdownRenderer({ config: readConfig(), assetBase: "./" });

const card = document.querySelector(".card");
if (card instanceof HTMLElement) {
  renderer.attachCodeBlockHandlers(card);
}

function syncNightMode(): void {
  const dark =
    document.body.classList.contains("nightMode") ||
    document.body.classList.contains("night_mode") ||
    matchMedia("(prefers-color-scheme: dark)").matches;

  document.documentElement.classList.toggle("night-mode", dark);
}

/** Render front/back fields to card DOM. */
export async function render(front: string, back: string) {
  syncNightMode();

  const wrapper = document.querySelector(".anki-md-wrapper");
  const frontEl = document.querySelector(".front");
  const backEl = document.querySelector(".back");

  if (wrapper instanceof HTMLElement) {
    wrapper.classList.add("anki-md-rendered");
  }

  const [frontHtml, backHtml] = await Promise.all([
    renderer.render(front),
    renderer.render(back),
  ]);

  if (frontEl) frontEl.innerHTML = frontHtml;
  if (backEl) backEl.innerHTML = backHtml;

  if (renderer.config.cardless) {
    wrapper?.classList.add("cardless");
  }
  wrapper?.classList.add("ready");
}
