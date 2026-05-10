import type { InputManager } from '../core/InputManager'
import type { Renderer } from './Renderer'

export class DefaultMenu {
  private inputManager: InputManager
  private renderer: Renderer

  constructor(inputManager: InputManager, renderer: Renderer) {
    this.inputManager = inputManager
    this.renderer = renderer
    this.registerKeys()
  }

  private registerKeys() {
    this.inputManager.onKeyDown((e) => {
      if (e.key === 'Escape') void this.openMainMenu()
    })
  }

  private async openMainMenu() {
    const options = ['Test', 'Test2', 'Palette']

    const selected = await this.renderer.uiLayer.showSelectMenu(10, 10, options)
    if (options[selected] === 'Palette') {
      await this.openPaletteMenu()
    }
  }

  private async openPaletteMenu() {
    const themes = this.renderer.themeManager.getThemeNames()
    const currentTheme = this.renderer.themeManager.current
    const currentIndex = themes.indexOf(currentTheme)
    const previousTheme = currentTheme

    const roller = this.renderer.uiLayer.createRollerMenu()

    roller.onChanged((selected: number) => {
      this.renderer.themeManager.set(themes[selected])
    })

    const selected = await roller.open(10, 10, themes, 1, currentIndex)

    if (selected === -1) {
      this.renderer.themeManager.set(previousTheme)
    }
  }
}
