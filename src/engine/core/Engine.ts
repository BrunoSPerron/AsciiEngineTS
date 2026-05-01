import { LocalWorld } from "../world/LocalWorld"
import { Camera } from "../render/Camera"
import { Renderer } from "../render/Renderer"
import { PlayerUnit } from "../world/Entities/PlayerUnit"
import { GlobalWorld } from "../world/GlobalWorld"

export const STEP = 1000 / 32
const MAX_FRAME_DELTA = 250
const MAX_UPDATES_PER_FRAME = 8

export class AsciiEngine {
   // Unloaded world data
   // WISHLIST Global World Simulation call in entity at interval
  globalWorld = new GlobalWorld()

  // Rendered and simulated part of the world
  localWorld = new LocalWorld()

  renderer: Renderer

  globalSimulationInterval = 500  // TODO settings
  globalSimulationUpdateCounter: number;

  last = 0
  acc = 0

  running = false
  paused = false
  rafId = 0

  private environmentReady = false

  constructor(root: HTMLDivElement) {
    root.classList.add("ascii-engine-host")
    const gameContainer = document.createElement("div")
    gameContainer.classList.add("ascii-engine")
    root.appendChild(gameContainer)

    //TEMPORARY camera target
    const playerUnit = new PlayerUnit("☺", 8, 8, 450)
    this.localWorld.spawnEntity(playerUnit)

    const camera = new Camera(gameContainer, playerUnit)
    this.renderer = new Renderer(gameContainer, camera)

    document.addEventListener("visibilitychange", this.handleVisibility)
    window.addEventListener("resize", this.handleWindowState)

    this.globalSimulationUpdateCounter = this.globalSimulationInterval;

  }

  start() {
    document.fonts.ready.then(function() {
      this.renderer.setTileHAndW();
      this.environmentReady = true;
      this.renderer.camera.jumpToTarget();
      this.resume()
    }.bind(this))
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

    // reset timing to avoid giant delta
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
    if (!this.environmentReady) return

    if (this.last === 0) {
      this.last = now
    }

    let deltaTime = now - this.last
    this.last = now

    if (!this.paused) {
      if (deltaTime > MAX_FRAME_DELTA) {
        deltaTime = MAX_FRAME_DELTA
      }

      this.acc += deltaTime
      let updates = 0

      while (
        this.acc >= STEP &&
        updates < MAX_UPDATES_PER_FRAME
      ) {
        this.update(deltaTime)
        this.acc -= STEP
        updates++
      }

      if (updates === MAX_UPDATES_PER_FRAME) {
        this.acc = 0
      }
    }

    const removedEntitiesIds: Array<number> = this.renderer.render(this.localWorld, deltaTime)

    for (const entityId of removedEntitiesIds) {
      const entity = this.localWorld.extractEntity(entityId)
      if (entity !== null) {
        this.globalWorld //TODO move extracted unit/chunk to global world
        entity.OnUnload()
      }
      delete this.localWorld.entities[entityId]
    }
    this.rafId = requestAnimationFrame(this.frame)
  }

  update(deltaTime: number) {
    this.localWorld.update()
    this.globalSimulationUpdateCounter -= deltaTime
    if (this.globalSimulationUpdateCounter <= 0) {
      this.globalWorld.update()
      this.globalSimulationUpdateCounter += this.globalSimulationInterval;
    }
  }
}
