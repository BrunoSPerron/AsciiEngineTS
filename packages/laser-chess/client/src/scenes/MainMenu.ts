import type { UILayout } from 'ascii-game-engine'
import { UISelectElement, UITextBox } from 'ascii-game-engine'
import { Scene, type SceneManager } from '../SceneManager'
import { BaseGameScene } from './BaseGameScene'
import { ServerConnection } from '../net/ServerConnection'

const SERVER_URL = 'wss://laser-chess.fly.dev'

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
    this.labelElement = new UITextBox(['Laser Chess', 'Beta'], 'centered')
    this.ui.addElement(this.labelElement, {
      y: -2,
      h: 5,
      w: 22,
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
    const options = ['Hotseat', 'Multiplayer', 'Palette', 'Quit']
    const selectEl = new UISelectElement(options, { closeOnSelect: false })
    this.ui.addElement(selectEl, {
      x: 0,
      y: 6,
      w: 14,
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
        case 'Hotseat':
          this.ui.removeElement(selectEl.id)
          this.sceneManager.NavigateTo(Scene.BoardConfig)
          break
        case 'Multiplayer':
          this.ui.removeElement(selectEl.id)
          this._connectAndNavigate()
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

  private _connectAndNavigate(): void {
    const ui = this.sceneManager.engine.renderer.ui

    // Show a connecting status box while the socket opens
    const statusBox = new UITextBox(['Connecting...'], 'centered')
    ui.addElement(statusBox, {
      w: 20,
      h: 1,
      anchorX: 50,
      anchorY: 50,
      pivotX: 50,
      pivotY: 50,
    })

    const conn = new ServerConnection(SERVER_URL)

    const unlistenState = conn.onStateChange((state) => {
      if (state === 'open') {
        unlistenState()
        ui.removeElement(statusBox.id, false)
        this.sceneManager.NavigateTo(Scene.Lobby, { conn })
      } else if (state === 'error' || state === 'closed') {
        unlistenState()
        statusBox.content = 'Could not connect'
        setTimeout(() => {
          if (this.sceneManager.currentScreen === this) {
            ui.removeElement(statusBox.id)
            this.openMainMenu()
          }
        }, 2500)
      }
    })
  }
}
