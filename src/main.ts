import './style.css'
import MarkdownItAsync from 'markdown-it-async'
import { fromAsyncCodeToHtml } from '@shikijs/markdown-it/async'
import { createHighlighter, bundledLanguages } from 'shiki/bundle/web'
import swift from 'shiki/langs/swift.mjs'
import {
  transformerMetaHighlight,
  transformerMetaWordHighlight,
  transformerNotationErrorLevel,
  transformerNotationFocus,
} from '@shikijs/transformers'

const langs = [...Object.keys(bundledLanguages), swift]
const themes = ['vitesse-light', 'vitesse-dark']
const highlighter = await createHighlighter({ langs, themes })

const md = MarkdownItAsync()
const highlight = (code: string, options: Parameters<typeof highlighter.codeToHtml>[1]) => {
  try {
    return highlighter.codeToHtml(code, options)
  } catch {
    return highlighter.codeToHtml(code, { ...options, lang: 'text' })
  }
}

md.use(fromAsyncCodeToHtml((code, options) => Promise.resolve(highlight(code, options)), {
  themes: { light: 'vitesse-light', dark: 'vitesse-dark' },
  transformers: [
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
