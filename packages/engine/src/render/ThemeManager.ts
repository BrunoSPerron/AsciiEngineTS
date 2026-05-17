type ThemeDef = {
  name: string
  path: string
}

export class ThemeManager {
  private themes = new Map<string, ThemeDef>()
  private link: HTMLLinkElement

  private _current: string = ''
  private _engineThemeWhitelist: string[] = []

  get current(): string {
    return this._current
  }

  constructor() {
    this.link = document.createElement('link')
    this.link.rel = 'stylesheet'
    document.head.appendChild(this.link)
  }

  init(engineThemeWhitelist: string[]) {
    this._engineThemeWhitelist = engineThemeWhitelist
    this.registerEngineThemes()
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

  private registerEngineThemes() {
    const engineThemeFiles = import.meta.glob<{ default: string }>('./css/themes/*.css', {
      query: '?url',
      eager: true,
    })
    for (const path in engineThemeFiles) {
      this.registerFile(path, engineThemeFiles[path].default)
    }
  }

  private registerFile(path: string, url: string) {
    const name = path.split('/').pop()!.replace('.css', '')
    if (this._engineThemeWhitelist.includes(name)) this.register(name, url)
  }
}
