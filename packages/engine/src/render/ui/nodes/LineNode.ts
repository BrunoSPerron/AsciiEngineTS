import type { TileMetricsData } from '../../tileMetrics'
import { UINode, type ILineLike } from './UINode'

export const LINE_GLYPHS: Record<number, string> = {
  0b00000: ' ',
  0b00001: ' ',

  // TODO: single-line variants (no DOUBLE bit) are not yet wired up.
  // Until the single/double distinction is implemented, DOUBLE is always
  // forced on in neighborMask(), making these entries unreachable dead code.
  0b01010: '─',
  0b00010: '─',
  0b01000: '─',

  0b01011: '═',
  0b00011: '═',
  0b01001: '═',

  0b10100: '│',
  0b00100: '│',
  0b10000: '│',

  0b10101: '║',
  0b00101: '║',
  0b10001: '║',

  0b01100: '┌',
  0b01101: '╔',

  0b00110: '┐',
  0b00111: '╗',

  0b11000: '└',
  0b11001: '╚',

  0b10010: '┘',
  0b10011: '╝',

  0b11100: '├',
  0b11101: '╠',

  0b10110: '┤',
  0b10111: '╣',

  0b11010: '┴',
  0b11011: '╩',

  0b01110: '┬',
  0b01111: '╦',

  0b11110: '┼',
  0b11111: '╬',
}

export const TOP = 0b10000
export const RIGHT = 0b01000
export const BOTTOM = 0b00100
export const LEFT = 0b00010
export const DOUBLE = 0b00001

export function maskToGlyph(mask: number): string {
  return LINE_GLYPHS[mask] ?? '?'
}

export class LineNode extends UINode implements ILineLike {
  constructor(
    id: number,
    kind: 'hline' | 'vline',
    el: HTMLDivElement,
    x: number,
    y: number,
    w: number,
    h: number,
    tileMetrics: TileMetricsData,
  ) {
    super(id, kind, el, x, y, w, h, [], tileMetrics)
  }

  cellCoords(): Array<[number, number]> {
    if (this.kind === 'vline') {
      return Array.from({ length: this.h }, (_, i): [number, number] => [this.x, this.y + i])
    } else {
      return Array.from({ length: this.w }, (_, i): [number, number] => [this.x + i, this.y])
    }
  }

  charIndexFor(x: number, y: number): number {
    if (this.kind === 'vline') {
      const i = y - this.y
      return i >= 0 && i < this.h ? i : -1
    }
    const i = x - this.x
    return i >= 0 && i < this.w ? i : -1
  }

  setCharAt(x: number, y: number, glyph: string): void {
    const idx = this.charIndexFor(x, y)
    if (idx === -1) return
    this.chars[idx] = glyph
    this.refresh()
  }

  refresh() {
    if (this.kind === 'vline') {
      this.el.textContent = this.chars.join('\n')
      return
    }
    this.el.textContent = this.chars.join('')
  }

  applyVerticalStyle() {
    this.el.style.whiteSpace = 'pre'
    this.el.style.lineHeight = `${this.tileMetrics.h}px`
  }
}
