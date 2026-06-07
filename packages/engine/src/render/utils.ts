export function makeLayer(css: string, parent: HTMLElement): HTMLDivElement {
  const el = document.createElement('div')
  el.className = `layer ${css}`
  parent.appendChild(el)
  return el
}
