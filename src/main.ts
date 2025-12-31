import logo from './logo.jpg'

export function render(front: string, back: string, isBack: boolean) {
  console.log("[anki-markdown] Side:", isBack ? "back" : "front")
  console.log("Input:", { front, back })
  console.log("Logo path:", logo)

  const frontEl = document.querySelector(".front")
  const backEl = document.querySelector(".back")
  if (frontEl) frontEl.innerHTML = `<img src="${logo}" alt="logo"><br>` + front
  if (isBack && backEl) backEl.innerHTML = back
}
