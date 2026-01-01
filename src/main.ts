import './style.css'
import MarkdownIt from 'markdown-it'
import { createHighlighter, bundledLanguages } from 'shiki/bundle/web'
import swift from 'shiki/langs/swift.mjs'
import type { ShikiTransformer } from 'shiki'
import type { Element } from 'hast'
import {
  transformerMetaHighlight,
  transformerMetaWordHighlight,
  transformerNotationErrorLevel,
  transformerNotationFocus,
} from '@shikijs/transformers'

const langs = [...Object.keys(bundledLanguages), swift]
const themes = { light: 'vitesse-light', dark: 'vitesse-dark' } as const
const transformers = [
  transformerMetaHighlight(),
  transformerMetaWordHighlight(),
  transformerNotationErrorLevel({ matchAlgorithm: 'v3' }),
  transformerNotationFocus({ matchAlgorithm: 'v3' }),
]

const highlighter = await createHighlighter({ langs, themes: Object.values(themes) })

const codeBlock: ShikiTransformer = {
  name: 'code-block',
  root(root) {
    const pre = root.children[0] as Element
    const lang = this.options.lang

    root.children = [{
      type: 'element',
      tagName: 'figure',
      properties: { class: 'code-block' },
      children: [
        pre,
        {
          type: 'element',
          tagName: 'figcaption',
          properties: { class: 'toolbar' },
          children: [
            { type: 'element', tagName: 'span', properties: { class: 'lang' }, children: [{ type: 'text', value: lang }] },
            {
              type: 'element',
              tagName: 'span',
              properties: { class: 'actions' },
              children: [
                { type: 'element', tagName: 'button', properties: { type: 'button', class: 'toggle' }, children: [{ type: 'text', value: 'Reveal' }] },
                { type: 'element', tagName: 'button', properties: { type: 'button', class: 'copy' }, children: [{ type: 'text', value: 'Copy' }] },
              ]
            }
          ]
        }
      ]
    }]
  }
}

const codeInline: ShikiTransformer = {
  name: 'code-inline',
  pre(node) {
    node.tagName = 'span'
  },
  code(node) {
    node.properties.class = 'code-inline'
  }
}

function highlight(code: string, lang: string, meta?: string) {
  try {
    return highlighter.codeToHtml(code, { lang, themes, meta: { __raw: meta }, defaultColor: false, transformers: [...transformers, codeBlock] })
  } catch {
    return highlighter.codeToHtml(code, { lang: 'text', themes, defaultColor: false, transformers: [codeBlock] })
  }
}

const md = MarkdownIt()

// Fence renderer: ```lang meta
md.renderer.rules.fence = (tokens, idx) => {
  const { content, info } = tokens[idx]
  const [lang, ...rest] = info.split(/\s+/)
  return highlight(content.trimEnd(), lang || 'text', rest.join(' '))
}

// Inline code: `code`{lang}
md.core.ruler.after('inline', 'inline-code-lang', (state) => {
  for (const token of state.tokens) {
    if (token.type !== 'inline' || !token.children) continue
    for (let i = 0; i < token.children.length; i++) {
      if (token.children[i].type !== 'code_inline') continue
      const next = token.children[i + 1]
      if (next?.type !== 'text') continue
      const match = next.content.match(/^\{\.?(\w+)\}(.*)$/)
      if (!match) continue
      const [, lang, rest] = match
      token.children[i].meta = { lang }
      next.content = rest
      if (!rest) token.children.splice(i + 1, 1)
    }
  }
})

md.renderer.rules.code_inline = (tokens, idx) => {
  const { content, meta } = tokens[idx]
  if (meta?.lang) {
    try {
      return highlighter.codeToHtml(content, {
        lang: meta.lang,
        themes,
        defaultColor: false,
        transformers: [codeInline],
      })
    } catch { /* fall through */ }
  }
  return `<code>${md.utils.escapeHtml(content)}</code>`
}

// Event delegation for toolbar
document.querySelector('.card')?.addEventListener('click', (e) => {
  const target = e.target as HTMLElement
  const block = target.closest('.code-block')
  if (!block) return

  if (target.closest('.toggle')) {
    block.classList.toggle('revealed')
  }
  const copy = target.closest('.copy') as HTMLElement
  if (copy) {
    navigator.clipboard.writeText(block.querySelector('code')?.textContent ?? '')
    copy.textContent = 'Copied'
    setTimeout(() => copy.textContent = 'Copy', 1500)
  }
})

export function render(front: string, back: string) {
  const frontEl = document.querySelector('.front')
  const backEl = document.querySelector('.back')
  if (frontEl) frontEl.innerHTML = md.render(front)
  if (backEl) backEl.innerHTML = md.render(back)
}
