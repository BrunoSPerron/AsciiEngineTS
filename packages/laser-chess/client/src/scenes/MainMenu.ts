import type { UILayout} from 'ascii-game-engine';
import { UISelectElement, UITextBox } from 'ascii-game-engine'
import type { SceneManager } from '../SceneManager'
import { BaseGameScene } from './BaseGameScene'

export class MainMenu extends BaseGameScene {
  ui: UILayout

  labelElement: UITextBox | null

  constructor(sceneManager: SceneManager) {
    super(sceneManager)
    this.ui = sceneManager.engine.renderer.ui
    this.labelElement = null
    this.openLabelElement()
    this.openMainMenu()
  }

  unload() {
    this.closeLabelElement()
  }

  openLabelElement() {
    if (this.labelElement !== null) return
    this.labelElement = new UITextBox(['BOB', 'IS', 'GREAT'])
    this.ui.addElement(this.labelElement, {
      y: -2,
      h: 7,
      w: 30,
      pivotX: 50,
      pivotY: 100,
      anchorX: 50,
      anchorY: 50,
    })
  }

  closeLabelElement() {
    if (this.labelElement === null) return
    this.ui.removeElement(this.labelElement.id)
  }

  openMainMenu() {
    const options = ['New Game', 'Palette', 'Quit']
    const selectEl = new UISelectElement(options, { closeOnSelect: false })
    this.ui.addElement(selectEl, {
      x: 0,
      y: 6,
      w: 12,
      h: options.length,
      anchorX: 50,
      anchorY: 50,
      pivotX: 50,
      pivotY: 100,
      minH: 1,
      minW: 1,
    })
    selectEl.onSelect((selectId: number) => {
      if (selectId === -1) return
      switch (options[selectId]) {
        case 'New Game':
          this.ui.removeElement(selectEl.id)
          this.sceneManager.NavigateTo('BoardConfig')
          break
        case 'Palette':
          this.openPaletteMenu()
          break
        default:
          break
      }
    })
  }

  openPaletteMenu() {
    this.ui.addPaletteElement({
      w: 30,
      h: 1,
      anchorX: 0,
      anchorY: 0,
      maxHPercent: 25,
      minH: 1,
      minW: 12,
    })
  }
}
