import type { InputManager } from "../core/InputManager"
import type { Renderer } from "./Renderer"

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
      if (e.key === "Escape") this.openMainMenu()
    })
  }

  private openMainMenu() {
    const options = ["Test", "Test2", "Palette"]
    this.renderer.uiLayer.showSelectMenu(10, 10, options).then((selected: number) => {
      if (options[selected] === "Palette") this.openPaletteMenu()
    })

    // TODO remove me (overlap test)
    setTimeout(()=>{
      this.renderer.uiLayer.showSelectMenu(13, 13, options)
    }, 1000)
  }

  private openPaletteMenu() {
    const themes = this.renderer.themeManager.getThemeNames()
    const currentTheme = this.renderer.themeManager.current
    const currentIndex = themes.indexOf(currentTheme)
    const previousTheme = currentTheme

    const roller = this.renderer.uiLayer.createRollerMenu()
    roller.onChanged((selected: number) => {
        this.renderer.themeManager.set(themes[selected])
    })

    roller.open(10, 10, themes, 1, currentIndex).then((selected: number) => {
        if (selected === -1) this.renderer.themeManager.set(previousTheme)
    })
  }
}