type Example = { front: string; back: string }

export function setup(examples: Example[], showBack: boolean, render: (f: string, b: string, s: boolean) => Promise<void>) {
  const params = new URLSearchParams(location.search)
  let i = +(params.get('i') ?? Math.floor(Math.random() * examples.length))
  if (!params.has('i')) { params.set('i', String(i)); history.replaceState(null, '', '?' + params) }

  const nav = document.querySelector('.nav')!
  const count = nav.querySelector('.count')!

  const show = async (idx: number) => {
    i = (idx + examples.length) % examples.length
    params.set('i', String(i))
    history.replaceState(null, '', '?' + params)
    count.textContent = `${i + 1}/${examples.length}`
    await render(examples[i].front, examples[i].back, showBack)
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'Enter') show(i + 1)
    if (e.key === 'ArrowLeft') show(i - 1)
  })

  show(i)
}
