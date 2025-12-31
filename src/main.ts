import './style.css'
import MarkdownIt from 'markdown-it'
import { fromHighlighter } from '@shikijs/markdown-it/core'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

const highlighter = await createHighlighterCore({
  themes: [
    import('@shikijs/themes/vitesse-light'),
    import('@shikijs/themes/vitesse-dark'),
  ],
  langs: [
    import('@shikijs/langs/javascript'),
    import('@shikijs/langs/typescript'),
    import('@shikijs/langs/rust'),
    import('@shikijs/langs/css'),
    import('@shikijs/langs/html'),
    import('@shikijs/langs/json'),
    import('@shikijs/langs/bash'),
  ],
  engine: createJavaScriptRegexEngine(),
})

const md = MarkdownIt()
// @ts-expect-error - types mismatch between core and markdown-it
md.use(fromHighlighter(highlighter, {
  themes: { light: 'vitesse-light', dark: 'vitesse-dark' }
}))

export function render(front: string, back: string, _back: boolean) {
  const frontEl = document.querySelector(".front")
  const backEl = document.querySelector(".back")
  if (!frontEl && !backEl) throw new Error("No front or back element found")

  if (frontEl) frontEl.innerHTML = md.render(front)
  if (backEl) backEl.innerHTML = md.render(back)
}
