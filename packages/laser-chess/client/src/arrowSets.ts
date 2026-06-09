/**
TODO No arrow set have monospaced diagonal arrows
  fix idea:
    .title {
      transform: scaleX(calc(N / M));
    }
  Where:
    N = desired width (px)
    M = original width (px)
 */
export const ARROW_SET: Record<string, string> = {
  NUMBER: '468279315',

  // diagonal not monospace
  BASIC: '←→↑↓↖↗↘↙x',

  // Not monospaced
  /*
  full: '⬅➡⬆⬇⬉⬈⬊⬋X',
  hollow: '⇦⇨⇧⇩⬁⬀⬂⬃X',
  double: '⇐⇒⇑⇓⇖⇗⇘⇙X',
  plusLine: '⭰⭲⭱⭳⭶⭷⭸⭹X',

  // add back the thicksets
  */
} as const

export function arrowGlyph(dirX: number, dirY: number): string {
  const set = ARROW_SET.NUMBER
  if (dirY === -1) {
    if (dirX === -1) return set[4]
    if (dirX === 0) return set[2]
    return set[5]
  } else if (dirY === 0) {
    if (dirX === -1) return set[0]
    if (dirX === 0) return set[8]
    return set[1]
  } else {
    if (dirX === -1) return set[7]
    if (dirX === 0) return set[3]
    return set[6]
  }
}
