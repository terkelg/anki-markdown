import './style.css'
import MarkdownIt from 'markdown-it'
import { fromHighlighter } from '@shikijs/markdown-it/core'
import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import {
  transformerMetaHighlight,
  transformerMetaWordHighlight,
  transformerNotationErrorLevel,
  transformerNotationFocus,
} from '@shikijs/transformers'

// Language registry - functions that return dynamic imports
const registry: Record<string, () => Promise<unknown>> = {
  javascript: () => import('@shikijs/langs/javascript'),
  js: () => import('@shikijs/langs/javascript'),
  typescript: () => import('@shikijs/langs/typescript'),
  ts: () => import('@shikijs/langs/typescript'),
  rust: () => import('@shikijs/langs/rust'),
  css: () => import('@shikijs/langs/css'),
  html: () => import('@shikijs/langs/html'),
  json: () => import('@shikijs/langs/json'),
  bash: () => import('@shikijs/langs/bash'),
  sh: () => import('@shikijs/langs/bash'),
}

// Extract languages from parsed tokens
function extract(tokens: ReturnType<MarkdownIt['parse']>): string[] {
  const found = new Set<string>()
  for (const token of tokens) {
    if (token.type === 'fence' && token.info) {
      const lang = token.info.split(/\s/)[0]
      if (registry[lang]) found.add(lang)
    }
  }
  return [...found]
}

// State
let highlighter: HighlighterCore
let md: MarkdownIt
const loaded = new Set<string>()

// Initialize core with themes only
async function init() {
  highlighter = await createHighlighterCore({
    themes: [
      import('@shikijs/themes/vitesse-light'),
      import('@shikijs/themes/vitesse-dark'),
    ],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  })
  md = MarkdownIt()
  // @ts-expect-error - types mismatch between core and markdown-it
  md.use(fromHighlighter(highlighter, {
    themes: { light: 'vitesse-light', dark: 'vitesse-dark' },
    transformers: [
      transformerMetaHighlight(),
      transformerMetaWordHighlight(),
      transformerNotationErrorLevel({ matchAlgorithm: 'v3' }),
      transformerNotationFocus({ matchAlgorithm: 'v3' }),
    ]
  }))
}

// Load languages on demand
async function load(langs: string[]) {
  const pending = langs.filter(l => !loaded.has(l))
  if (!pending.length) return

  await Promise.all(pending.map(async lang => {
    const mod = await registry[lang]()
    // @ts-expect-error - dynamic module
    await highlighter.loadLanguage(mod.default)
    loaded.add(lang)
  }))
}

const ready = init()

export async function render(front: string, back: string, _showBack: boolean) {
  await ready

  // Parse once
  const frontTokens = md.parse(front, {})
  const backTokens = md.parse(back, {})

  // Load only needed languages
  await load(extract([...frontTokens, ...backTokens]))

  // Render from tokens (no re-parse)
  const frontEl = document.querySelector(".front")
  const backEl = document.querySelector(".back")
  if (!frontEl && !backEl) throw new Error("No front or back element found")

  if (frontEl) frontEl.innerHTML = md.renderer.render(frontTokens, md.options, {})
  if (backEl) backEl.innerHTML = md.renderer.render(backTokens, md.options, {})
}
