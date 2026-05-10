import { parse } from 'smol-toml'

export type EngineConfig = {
  game: {
    title: string
    start_theme: string
  }
  world: {
    seed: number
  }
}

export const DEFAULT_CONFIG: EngineConfig = {
  game: {
    title: 'AsciiEngine',
    start_theme: 'Copper',
  },
  world: {
    seed: 0,
  },
}

function mergeConfig(defaults: EngineConfig, overrides: Partial<EngineConfig>): EngineConfig {
  return {
    game: { ...defaults.game, ...overrides.game },
    world: { ...defaults.world, ...overrides.world },
  }
}

function assertString(val: unknown, path: string): string {
  if (typeof val !== 'string') {
    throw new Error(`Config: expected string at ${path}, got ${typeof val}`)
  }
  return val
}

function assertNumber(val: unknown, path: string): number {
  if (typeof val !== 'number') {
    throw new Error(`Config: expected number at ${path}, got ${typeof val}`)
  }
  return val
}

function parseTomlToConfig(raw: Record<string, unknown>): Partial<EngineConfig> {
  const result: Partial<EngineConfig> = {}

  if ('game' in raw && raw.game !== null && typeof raw.game === 'object') {
    const game = raw.game as Record<string, unknown>
    result.game = {
      title: 'title' in game ? assertString(game.title, 'game.title') : DEFAULT_CONFIG.game.title,
      start_theme:
        'start_theme' in game
          ? assertString(game.start_theme, 'game.start_theme')
          : DEFAULT_CONFIG.game.start_theme,
    }
  }

  if ('world' in raw && raw.world !== null && typeof raw.world === 'object') {
    const world = raw.world as Record<string, unknown>
    result.world = {
      seed: 'seed' in world ? assertNumber(world.seed, 'world.seed') : DEFAULT_CONFIG.world.seed,
    }
  }

  return result
}

export async function loadConfig(gameName: string): Promise<EngineConfig> {
  const path = `/ascii-engine-settings/${gameName}.toml`

  try {
    const response = await fetch(path)

    if (!response.ok) {
      if (response.status === 404) {
        // eslint-disable-next-line no-console
        console.info(`[AsciiEngine] No config found at ${path}, using defaults.`)
        return DEFAULT_CONFIG
      }
      throw new Error(`Failed to fetch config: ${response.statusText}`)
    }

    const text = await response.text()
    const raw = parse(text) as Record<string, unknown>
    const overrides = parseTomlToConfig(raw)
    return mergeConfig(DEFAULT_CONFIG, overrides)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[AsciiEngine] Could not load config at ${path}, using defaults.`, err)
    return DEFAULT_CONFIG
  }
}
