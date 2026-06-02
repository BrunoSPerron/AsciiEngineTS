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
