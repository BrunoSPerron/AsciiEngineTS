export type GameAssets = {
  configUrl: string | null
  baseCssUrl: string | null
  themes: Array<{ name: string; url: string }>
}

export function loadGameAssets(glob: Record<string, string>): GameAssets {
  const configUrl =
    Object.entries(glob).find(([path]) => path.endsWith('/engine-settings.toml'))?.[1] ?? null

  const baseCssUrl = Object.entries(glob).find(([path]) => path.endsWith('/base.css'))?.[1] ?? null

  const themes = Object.entries(glob)
    .filter(([path]) => path.includes('/themes/') && path.endsWith('.css'))
    .map(([path, url]) => ({
      name: path.split('/').pop()!.replace('.css', ''),
      url,
    }))

  return { configUrl, baseCssUrl, themes }
}
