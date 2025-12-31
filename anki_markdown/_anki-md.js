export function render(front, back, isBack) {
  const frontEl = document.querySelector(".front")
  const backEl = document.querySelector(".back")

  if (frontEl) frontEl.innerHTML = front
  if (isBack && backEl) backEl.innerHTML = back
}
