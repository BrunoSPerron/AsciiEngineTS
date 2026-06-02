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

export { UIContainerBase } from './render/ui/layout_elements/UIContainerBase'
export { UIContainerVertical } from './render/ui/layout_elements/UIContainerVertical'
export { UIInputElement, type UIInputOptions } from './render/ui/layout_elements/UIInputElement'
export { UILayoutElement } from './render/ui/layout_elements/UILayoutElement'
export { UISelectBase } from './render/ui/layout_elements/UISelectBase'
export { UISelectElement } from './render/ui/layout_elements/UISelectElement'
export { UITextBox } from './render/ui/layout_elements/UITextBox'
export {
  UITextInputElement,
  type UITextInputOptions,
} from './render/ui/layout_elements/UITextInputElement'

export { WorldUILayer } from './render/ui/WorldUILayer'

export { GridVector } from './math/GridVector'
export { clamp, lerp } from './math/utils'
