type ThemeDef = {
  name: string
  path: string
}

export class ThemeManager {
  private themes = new Map<string, ThemeDef>()
  private link: HTMLLinkElement

  private _current: string = ''

  get current(): string {
    return this._current
  }

  constructor() {
    this.link = document.createElement('link')
    this.link.rel = 'stylesheet'
    document.head.appendChild(this.link)

    this.registerAllThemes()
    this.preloadAllThemes()
  }

  register(name: string, path: string) {
    this.themes.set(name.toLowerCase(), { name, path })
  }

  set(name: string) {
    const theme = this.themes.get(name.toLowerCase())
    if (theme) {
      this.link.href = theme.path
      this._current = theme.name
    }
  }

  getThemeNames(): string[] {
    return [...this.themes.values()].map((t) => t.name)
  }

  private preloadAllThemes() {
    for (const def of this.themes.values()) {
      void fetch(def.path)
    }
  }

  private registerAllThemes() {
    const engineThemeFiles = import.meta.glob('./css/themes/*.css', { query: '?url', eager: true })
    const gameThemeFiles = import.meta.glob('../../game/themes/*.css', {
      query: '?url',
      eager: true,
    })
    for (const path in engineThemeFiles) {
      this.registerFile(path, engineThemeFiles[path]['default'] as string)
    }
    for (const path in gameThemeFiles) {
      this.registerFile(path, gameThemeFiles[path]['default'] as string)
    }
  }

  private registerFile(path: string, url: string) {
    const name = path.split('/').pop()!.replace('.css', '')

    this.register(name, url)
  }
}
