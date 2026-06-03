import { UIContainerBase, type InnerLineData } from 'ascii-game-engine'

export class UIContainerVertical extends UIContainerBase {
  protected _layoutChildren(): void {
    throw new Error('Method not implemented.')
  }

  getInnerLineData(): InnerLineData[] {
    return []
  }
}
