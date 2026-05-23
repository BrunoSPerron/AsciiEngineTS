export type GameAssets = {
  configUrl: string | null
  baseCssUrl: string | null
  themes: Array<{ name: string; css: string }>
}

export async function loadGameAssets(glob: Record<string, string>): Promise<GameAssets> {
  const configUrl =
    Object.entries(glob).find(([path]) => path.endsWith('/engine-settings.toml'))?.[1] ?? null

  const baseCssUrl = Object.entries(glob).find(([path]) => path.endsWith('/base.css'))?.[1] ?? null

  const themeEntries = Object.entries(glob).filter(
    ([path]) => path.includes('/themes/') && path.endsWith('.css'),
  )

  const themes = await Promise.all(
    themeEntries.map(async ([path, url]) => ({
      name: path.split('/').pop()!.replace('.css', ''),
      css: await fetch(url).then((r) => r.text()),
    })),
  )

  return { configUrl, baseCssUrl, themes }
}
