export { AsciiEngine } from './core/Engine'

export type { GameAssets } from './core/GameAssets'

export { ActionManager } from './input/ActionManager'
export { ContextManager, type ZoneOptions } from './input/ContextManager'
export { PointerManager } from './input/PointerManager'

export { World } from './world/World'
export { Entity } from './world/entities/Entity'
export { type Chunk, CHUNK_SIZE } from './world/Chunk'
export type { Tile } from './world/Tile'

export { Camera } from './render/Camera'
export { MASK, maskToGlyph, invertDirectionMask } from './render/lineGlyph'
export type { TileMetricsData } from './render/tileMetrics'
export { UILayout } from './render/ui/UILayout'

export { UIContainerBase, type InnerLineData } from './render/ui/node/UIContainerBase'
export { UIContainerVertical } from './render/ui/node/UIContainerVertical'
export { UIInputBase, type UIInputOptions } from './render/ui/node/UIInputBase'
export { UINode } from './render/ui/node/UINode'
export { UISelectBase } from './render/ui/node/UISelectBase'
export { UISelectElement } from './render/ui/node/UISelectElement'
export { UITextBox } from './render/ui/node/UITextBox'
export { UITextInputElement, type UITextInputOptions } from './render/ui/node/UITextInputElement'

export { WorldUILayer } from './render/ui/WorldUILayer'

export { GridVector } from './math/GridVector'
export { clamp, lerp } from './math/utils'
