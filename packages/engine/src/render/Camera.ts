import { lerp } from '../math/utils'
import { GridVector } from '../math/GridVector'
import { Entity } from '../world/entities/Entity'
import { EngineObject } from '../core/EngineObject'
import type { AsciiEngine } from '../core/Engine'

export type CameraEvent = {
  frame: [now: number]
  chunkinvalidated: []
}

export class Camera extends EngineObject<CameraEvent> {
  pos = new GridVector()

  private _target: Entity
  private _placeholder: Entity | null

  private _targetUnlisten: () => void = () => {}

  private _rafId = 0
  private _last = 0

  get viewport(): HTMLDivElement {
    return this.engine.gameContainer
  }

  constructor() {
    super()

    this._placeholder = new Entity(' ', new GridVector(0, 0), 0)
    this._target = this._placeholder
    this._listenToTarget()
  }

  get target(): Entity {
    return this._target
  }

  set target(entity: Entity) {
    this._placeholder = null
    this._target = entity
    this._listenToTarget()
    this.emit('chunkinvalidated')
  }

  _init(engine: AsciiEngine) {
    super._init(engine)
    this.setInitialPosition(...engine.config.camera.initial_position)
  }

  private _listenToTarget() {
    this._targetUnlisten()
    this._targetUnlisten = this.listen(
      this._target.on('chunkchange', () => {
        this.emit('chunkinvalidated')
      }),
    )
  }

  setInitialPosition(x: number, y: number) {
    if (this._placeholder === null) return
    this._placeholder.pos.x = x
    this._placeholder.pos.y = y
    this._placeholder.previousPos.x = x
    this._placeholder.previousPos.y = y
  }

  jumpToTarget() {
    const tm = this.engine.renderer.tileMetrics
    const now = performance.now()
    const pos = this._target.visualPosition(now)
    const clientRect = this.viewport.getBoundingClientRect()
    const offsetPx = this.engine.renderer.ui.getContentCenterOffset()
    this.pos.x = pos[0] - clientRect.width / tm.w / 2 - offsetPx.x / tm.w + 0.5
    this.pos.y = pos[1] - clientRect.height / tm.h / 2 - offsetPx.y / tm.h + 0.5
  }

  start() {
    if (this._rafId) return
    this._last = 0
    this._rafId = requestAnimationFrame(this._frame)
  }

  suspend() {
    if (!this._rafId) return
    cancelAnimationFrame(this._rafId)
    this._rafId = 0
    this._last = 0
  }

  resume() {
    this.start()
  }

  private _frame = (now: number) => {
    if (this._last === 0) this._last = now
    const delta = now - this._last
    this._last = now

    this._update(now, delta)
    this.emit('frame', now)

    this._rafId = requestAnimationFrame(this._frame)
  }

  private _update(now: number, delta: number) {
    const tm = this.engine.renderer.tileMetrics
    const pos = this._target.visualPosition(now)
    const clientRect = this.viewport.getBoundingClientRect()
    const offsetPx = this.engine.renderer.ui.getContentCenterOffset()
    const tx = pos[0] - clientRect.width / tm.w / 2 - offsetPx.x / tm.w + 0.5
    const ty = pos[1] - clientRect.height / tm.h / 2 - offsetPx.y / tm.h + 0.5
    const alpha = 1 - Math.pow(0.5, delta / this.engine.config.camera.half_life)
    this.pos.x = lerp(this.pos.x, tx, alpha)
    this.pos.y = lerp(this.pos.y, ty, alpha)
  }
}
