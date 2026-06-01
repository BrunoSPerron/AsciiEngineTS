/**
TODO No arrow set have monospaced diagonal arrows
  fix idea:
    .title {
      transform: scaleX(calc(300 / 180));
    }
  Where:
    300 = desired width (px)
    180 = original width (px)
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
