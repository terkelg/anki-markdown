import './style.css'
import type MarkdownIt from 'markdown-it'
import MarkdownItAsync from 'markdown-it-async'
import { fromAsyncCodeToHtml } from '@shikijs/markdown-it/async'
import { createHighlighter, bundledLanguages } from 'shiki/bundle/web'
import swift from 'shiki/langs/swift.mjs'
import type { ShikiTransformer } from 'shiki'
import {
  transformerMetaHighlight,
  transformerMetaWordHighlight,
  transformerNotationErrorLevel,
  transformerNotationFocus,
} from '@shikijs/transformers'

const langs = [...Object.keys(bundledLanguages), swift]
const themes = { light: 'vitesse-light', dark: 'vitesse-dark' } as const
const highlighter = await createHighlighter({ langs, themes: Object.values(themes) })

const wrapper: ShikiTransformer = {
  name: 'wrapper',
  pre(node) {
    this.addClassToHast(node, 'code')
  }
}

// Inline code highlighting: `code`{lang} or `code`{.lang}
const inlineCode = (md: MarkdownIt) => {
  // Parse {lang} after inline code tokens
  md.core.ruler.after('inline', 'inline-code-lang', (state) => {
    for (const token of state.tokens) {
      if (token.type !== 'inline' || !token.children) continue

      const children = token.children
      for (let i = 0; i < children.length; i++) {
        if (children[i].type !== 'code_inline') continue

        const next = children[i + 1]
        if (next?.type !== 'text') continue

        const match = next.content.match(/^\{\.?(\w+)\}(.*)$/)
        if (!match) continue

        const [, lang, rest] = match
        children[i].meta = { lang }
        next.content = rest
        if (!rest) children.splice(i + 1, 1)
      }
    }
  })

  // Render with syntax highlighting
  const original = md.renderer.rules.code_inline
  md.renderer.rules.code_inline = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const lang = token.meta?.lang

    if (lang) {
      try {
        const html = highlighter.codeToHtml(token.content, {
          lang,
          themes,
          defaultColor: false,
          structure: 'inline',
        })
        return `<code class="inline shiki">${html}</code>`
      } catch {
        return `<code>${md.utils.escapeHtml(token.content)}</code>`
      }
    }

    return original?.(tokens, idx, options, env, self)
      ?? `<code>${md.utils.escapeHtml(token.content)}</code>`
  }
}

const md = MarkdownItAsync()
md.use(inlineCode)
md.use(fromAsyncCodeToHtml((code, options) => {
  try {
    return Promise.resolve(highlighter.codeToHtml(code, options))
  } catch {
    return Promise.resolve(highlighter.codeToHtml(code, { ...options, lang: 'text' }))
  }
}, {
  themes,
  defaultColor: false,
  transformers: [
    wrapper,
    transformerMetaHighlight(),
    transformerMetaWordHighlight(),
    transformerNotationErrorLevel({ matchAlgorithm: 'v3' }),
    transformerNotationFocus({ matchAlgorithm: 'v3' }),
  ]
}))

document.querySelector('.card')?.addEventListener('click', (e) => {
  const el = (e.target as Element).closest('.shiki.has-focused')
  if (el) el.classList.toggle('revealed')
})

export async function render(front: string, back: string, _showBack: boolean) {
  const frontEl = document.querySelector(".front")
  const backEl = document.querySelector(".back")
  if (!frontEl && !backEl) throw new Error("No front or back element found")

  if (frontEl) frontEl.innerHTML = await md.renderAsync(front)
  if (backEl) backEl.innerHTML = await md.renderAsync(back)
}
