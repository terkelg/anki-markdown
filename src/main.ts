import './style.css'
import MarkdownItAsync from 'markdown-it-async'
import { fromAsyncCodeToHtml } from '@shikijs/markdown-it/async'
import { codeToHtml } from 'shiki'
import {
  transformerMetaHighlight,
  transformerMetaWordHighlight,
  transformerNotationErrorLevel,
  transformerNotationFocus,
} from '@shikijs/transformers'

const md = MarkdownItAsync()
md.use(fromAsyncCodeToHtml(codeToHtml, {
  themes: { light: 'vitesse-light', dark: 'vitesse-dark' },
  transformers: [
    transformerMetaHighlight(),
    transformerMetaWordHighlight(),
    transformerNotationErrorLevel({ matchAlgorithm: 'v3' }),
    transformerNotationFocus({ matchAlgorithm: 'v3' }),
  ]
}))

export async function render(front: string, back: string, _showBack: boolean) {
  const frontEl = document.querySelector(".front")
  const backEl = document.querySelector(".back")
  if (!frontEl && !backEl) throw new Error("No front or back element found")

  if (frontEl) frontEl.innerHTML = await md.renderAsync(front)
  if (backEl) backEl.innerHTML = await md.renderAsync(back)
}
