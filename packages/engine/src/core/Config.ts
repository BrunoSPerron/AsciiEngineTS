import merge from 'deepmerge'
import { parse } from 'smol-toml'
import { z } from 'zod'

import { Logger } from './Logger'

// DEFAULT_CONFIG is the source of truth, any change is derived when loaded
export const DEFAULT_CONFIG = {
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
    initial_position: [0, 0] as [number, number],
  },
}

export type EngineConfig = typeof DEFAULT_CONFIG

const ConfigSchema = createSchema(DEFAULT_CONFIG) as z.ZodObject

function createSchema(value: unknown): z.ZodTypeAny {
  if (typeof value === 'string') {
    return z.string()
  }

  if (typeof value === 'number') {
    return z.number()
  }

  if (typeof value === 'boolean') {
    return z.boolean()
  }

  if (Array.isArray(value)) {
    // TODO improve tuple validation
    if (value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      return z.tuple([z.number(), z.number()])
    }
    return z.array(createSchema(value[0]))
  }

  if (value && typeof value === 'object') {
    const shape: Record<string, z.ZodTypeAny> = {}
    for (const [key, nested] of Object.entries(value)) {
      shape[key] = createSchema(nested)
    }
    return z.object(shape).strict()
  }

  throw new Error(`Unsupported config value: ${String(value)}`)
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
    const raw = parse(text)
    const merged = merge(DEFAULT_CONFIG, raw, {
      arrayMerge: (_dest, source) => source,
    })

    ConfigSchema.parse(merged)

    return merged as EngineConfig
  } catch (err) {
    Logger.error(`Could not load config at ${url}, using defaults.\n`, err)
    return DEFAULT_CONFIG
  }
}
