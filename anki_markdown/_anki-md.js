function render(front, back, isBack) {
  const card = document.querySelector(".card")

  console.log("Side:", isBack ? "back" : "front")
  console.log("Front:", front)
  console.log("Back:", back)

  if (card) {
    if (isBack) {
      card.innerHTML = `<div class="front">${front}</div><div class="back">${back}</div>`
    } else {
      card.innerHTML = `<div class="front">${front}</div>`
    }
  }
}
