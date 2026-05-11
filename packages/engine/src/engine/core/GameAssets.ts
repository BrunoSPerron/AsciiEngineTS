export type GameAssetsInput = {
  themes?: Record<string, string>
}

export type GameAssets = {
  themes: Array<{ name: string; url: string }>
}

export function loadGameAssets(input: GameAssetsInput): GameAssets {
  return {
    themes: Object.entries(input.themes ?? {}).map(([path, url]) => ({
      name: path.split('/').pop()!.replace('.css', ''),
      url,
    })),
  }
}
