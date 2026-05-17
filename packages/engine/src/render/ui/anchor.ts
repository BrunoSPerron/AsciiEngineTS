/**
 * The point on a UINode that is pinned to its (x, y) grid position.
 *
 * Values follow numpad layout — 7 is top-left, 5 is center, 1 is bottom-left:
 *
 *   7  8  9   (TopLeft  TopCenter  TopRight)
 *   4  5  6   (MiddleLeft  MiddleCenter  MiddleRight)
 *   1  2  3   (BottomLeft  BottomCenter  BottomRight)
 */
export const Anchor = {
  TopLeft: 7,
  TopCenter: 8,
  TopRight: 9,
  MiddleLeft: 4,
  MiddleCenter: 5,
  MiddleRight: 6,
  BottomLeft: 1,
  BottomCenter: 2,
  BottomRight: 3,
} as const

export type Anchor = (typeof Anchor)[keyof typeof Anchor]

/** Maps each anchor value to its CSS percentage offset [x%, y%]. */
export const ANCHOR_TRANSLATE: Record<Anchor, [string, string]> = {
  [Anchor.TopLeft]: ['0%', '0%'],
  [Anchor.TopCenter]: ['-50%', '0%'],
  [Anchor.TopRight]: ['-100%', '0%'],
  [Anchor.MiddleLeft]: ['0%', '-50%'],
  [Anchor.MiddleCenter]: ['-50%', '-50%'],
  [Anchor.MiddleRight]: ['-100%', '-50%'],
  [Anchor.BottomLeft]: ['0%', '-100%'],
  [Anchor.BottomCenter]: ['-50%', '-100%'],
  [Anchor.BottomRight]: ['-100%', '-100%'],
}

/**
 * Offset a panel element so is align with the requested anchor.
 *
 * The container must be position:absolute inside the inset:0 layer.
 * wPx / hPx are the panel's pixel dimensions (w * tileW, h * tileH).
 * xPx / yPx are the anchor point in pixels (x * tileW, y * tileH).
 */
export function offsetElPivot(
  el: HTMLElement,
  anchor: Anchor,
  width: number,
  height: number,
): void {
  // Numpad layout: value % 3 gives column (1=left, 2=center, 0=right)
  //                ceil(value / 3) gives row (3=top, 2=middle, 1=bottom)
  const col = anchor % 3
  const row = Math.ceil(anchor / 3)

  switch (col) {
    case 1:
      el.style.left = `0`
      break
    case 2:
      el.style.left = `-${width / 2}px`
      break
    case 0:
      el.style.left = `-${width}px`
      break
  }

  switch (row) {
    case 3:
      el.style.top = `0`
      break
    case 2:
      el.style.top = `-${height / 2}px`
      break
    case 1:
      el.style.top = `-${height}px`
      break
  }
}

/**
 * Positions a panel container using CSS calc() so that it can be used as an anchor
 */
export function applyAnchorToEl(el: HTMLElement, anchor: Anchor): void {
  const col = anchor % 3
  const row = Math.ceil(anchor / 3)

  switch (col) {
    case 1:
      el.style.left = `0`
      break
    case 2:
      el.style.left = `50%`
      break
    case 0:
      el.style.left = `100%`
      break
  }

  switch (row) {
    case 3:
      el.style.top = `0`
      break
    case 2:
      el.style.top = `50%`
      break
    case 1:
      el.style.top = `100%`
      break
  }
}
