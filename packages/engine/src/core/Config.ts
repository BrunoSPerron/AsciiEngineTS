import { parse } from 'smol-toml'
import { Logger } from './Logger'

export type EngineConfig = {
  game: {
    title: string
    start_theme: string
  }
  world: {
    seed: number
    chunk_view_distance: number
  }
  camera: {
    half_life: number
    initial_position: [number, number]
  }
}

export const DEFAULT_CONFIG: EngineConfig = {
  game: {
    title: 'AsciiEngine',
    start_theme: 'Copper',
  },
  world: {
    seed: 0,
    chunk_view_distance: 3,
  },
  camera: {
    half_life: 120,
    initial_position: [0, 0],
  },
}

function mergeConfig(defaults: EngineConfig, overrides: Partial<EngineConfig>): EngineConfig {
  return {
    game: { ...defaults.game, ...overrides.game },
    world: { ...defaults.world, ...overrides.world },
    camera: { ...defaults.camera, ...overrides.camera },
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

function assertNumberTuple(val: unknown, path: string): [number, number] {
  if (
    !Array.isArray(val) ||
    val.length !== 2 ||
    typeof val[0] !== 'number' ||
    typeof val[1] !== 'number'
  ) {
    throw new Error(`Config: expected [number, number] at ${path}`)
  }
  return [val[0], val[1]]
}

function parseTomlToConfig(raw: Record<string, unknown>): Partial<EngineConfig> {
  const result: Partial<EngineConfig> = {}

  if ('camera' in raw && raw.camera !== null && typeof raw.camera === 'object') {
    const camera = raw.camera as Record<string, unknown>
    result.camera = {
      half_life:
        'half_life' in camera
          ? assertNumber(camera.half_life, 'camera.half_life')
          : DEFAULT_CONFIG.camera.half_life,
      initial_position:
        'initial_position' in camera
          ? assertNumberTuple(camera.initial_position, 'camera.initial_position')
          : DEFAULT_CONFIG.camera.initial_position,
    }
  }

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
      chunk_view_distance:
        'chunk_view_distance' in world
          ? assertNumber(world.chunk_view_distance, 'world.chunk_view_distance')
          : DEFAULT_CONFIG.world.chunk_view_distance,
    }
  }

  return result
}

export async function loadConfig(url: string | null): Promise<EngineConfig> {
  if (!url) {
    Logger.info('No config provided, using defaults.')
    return DEFAULT_CONFIG
  }

  try {
    const response = await fetch(url)

    if (!response.ok) {
      if (response.status === 404) {
        Logger.info(`No config found at ${url}, using defaults.`)
        return DEFAULT_CONFIG
      }
      throw new Error(`Failed to fetch config: ${response.statusText}`)
    }

    const text = await response.text()
    const raw = parse(text) as Record<string, unknown>
    const overrides = parseTomlToConfig(raw)
    return mergeConfig(DEFAULT_CONFIG, overrides)
  } catch (err) {
    Logger.warn(`Could not load config at ${url}, using defaults.`, err)
    return DEFAULT_CONFIG
  }
}
