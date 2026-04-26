import { LocalWorld } from "../world/LocalWorld"
import { Camera } from "../render/Camera"
import { Renderer } from "../render/Renderer"
import { PlayerUnit } from "../world/Entities/PlayerUnit"
import { GlobalWorld } from "../world/GlobalWorld"

export const STEP = 1000 / 32
const MAX_FRAME_DELTA = 250
const MAX_UPDATES_PER_FRAME = 8

export class Engine {
  globalWorld = new GlobalWorld()
  localWorld = new LocalWorld()
  renderer: Renderer

  last = 0
  acc = 0

  running = false
  paused = false
  rafId = 0

  constructor(root: HTMLDivElement) {
    const playerUnit = new PlayerUnit(-1, "☺", 8, 8, 450)
    this.localWorld.spawnEntity(playerUnit)
    const camera = new Camera(root, playerUnit)
    this.renderer = new Renderer(root, camera)

    document.addEventListener("visibilitychange", this.handleVisibility)
    window.addEventListener("resize", this.handleWindowState)
  }

  start() {
    this.resume()
  }

  destroy() {
    this.suspend()

    document.removeEventListener(
      "visibilitychange",
      this.handleVisibility
    )

    window.removeEventListener(
      "resize",
      this.handleWindowState
    )
  }

  pause() {
    this.paused = true
  }

  unpause() {
    this.paused = false
  }

  suspend = () => {
    if (!this.running) return

    this.running = false
    cancelAnimationFrame(this.rafId)
    this.rafId = 0
  }

  resume = () => {
    if (this.running) return
    if (document.hidden) return

    this.running = true

    // reset timing to avoid giant delta after tab restore
    this.last = 0
    this.acc = 0

    this.rafId = requestAnimationFrame(this.frame)
  }

  handleWindowState = () => {
    const minimized =
      window.innerWidth === 0 ||
      window.innerHeight === 0

    if (minimized || document.hidden) {
      this.suspend()
    } else {
      this.resume()
    }
  }

  handleVisibility = () => {
    if (document.hidden) {
      this.suspend()
    } else {
      this.resume()
    }
  }

  frame = (now: number) => {
    if (!this.running) return

    if (this.last === 0) {
      this.last = now
    }

    let deltaTime = now - this.last
    this.last = now

    if (deltaTime > MAX_FRAME_DELTA) {
      deltaTime = MAX_FRAME_DELTA
    }

    this.acc += deltaTime
    let updates = 0

    while (
      this.acc >= STEP &&
      updates < MAX_UPDATES_PER_FRAME
    ) {
      this.update()
      this.acc -= STEP
      updates++
    }

    if (updates === MAX_UPDATES_PER_FRAME) {
      this.acc = 0
    }

    const removedEntitiesIds: Array<number> = this.renderer.render(this.localWorld, deltaTime)

    for (const entityId of removedEntitiesIds) {
      const entity = this.localWorld.extractEntity(entityId)
      if (entity !== null) {
        this.globalWorld
      }
      delete this.localWorld.entities[entityId]
    }

    this.rafId = requestAnimationFrame(this.frame)
  }

  update() {
    this.localWorld.update()
  }
}
