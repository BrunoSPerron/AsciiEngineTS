import { UINode } from './UINode'

export abstract class UISelectBase extends UINode {
  abstract currentIndex: number
  closeOnSelect: boolean = true
  suppressOnClose: Set<string> = new Set(['confirm', 'cancel', 'pause'])
}
