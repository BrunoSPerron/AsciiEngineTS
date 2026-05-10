import { LocalWorld } from "../world/LocalWorld"
import { Camera } from "../render/Camera"
import { PlayerUnit } from "../world/entities/PlayerUnit"
import { GlobalWorld } from "../world/GlobalWorld"
import { InputManager } from "./InputManager"
import { Renderer } from "../render/Renderer"
import { DefaultMenu } from "../render/DefaultMenu"

export class AsciiEngine {
  // Unloaded world data, world simulation called at interval
  globalWorld = new GlobalWorld()

  // Rendered and fully simulated part of the world
  localWorld = new LocalWorld()

  inputManager: InputManager
  renderer: Renderer

  running = false
  paused = false
  rafId = 0

  private environmentReady = false

  constructor(root: HTMLDivElement) {
    root.classList.add("ascii-engine-host")
    const gameContainer = document.createElement("div")
    gameContainer.classList.add("ascii-engine")
    root.appendChild(gameContainer)

    this.localWorld.bind(this)

    const cameraTarget = this.localWorld.spawnEntity(new PlayerUnit("☺", 8, 8, 250))
    const camera = new Camera(gameContainer, cameraTarget)
    camera.onChunksInvalidated = () => this.renderer.invalidateChunks()

    this.inputManager = new InputManager()
    this.renderer = new Renderer(gameContainer, camera, this.inputManager)
    this.renderer.bindWorld(this.localWorld)

    document.addEventListener("visibilitychange", this.handleVisibility)
    window.addEventListener("resize", this.handleWindowState)
  }

  start() {
    document.fonts.ready.then(function(this: AsciiEngine) {
      this.renderer.setTileHAndW()
      this.environmentReady = true
      this.renderer.camera.jumpToTarget(performance.now())

      new DefaultMenu(this.inputManager, this.renderer)

      this.resume()
    }.bind(this))
  }

  destroy() {
    this.suspend()
    this.localWorld.entities.forEach(e => e.unschedule())

    document.removeEventListener("visibilitychange", this.handleVisibility)
    window.removeEventListener("resize", this.handleWindowState)
  }

  pause() {
    if (this.paused) return
    this.paused = true
    this.localWorld.entities.forEach(e => e.unschedule())
  }

  unpause() {
    if (!this.paused) return
    this.paused = false
    this.localWorld.entities.forEach(e => e.scheduleFirst(this))
  }

  suspend = () => {
    if (!this.running) return
    this.running = false
    cancelAnimationFrame(this.rafId)
    this.rafId = 0
    this.localWorld.entities.forEach(e => e.unschedule())
  }

  resume = () => {
    if (this.running) return
    if (document.hidden) return
    this.running = true
    if (!this.paused)
      this.localWorld.entities.forEach(e => e.scheduleFirst(this))
    this.rafId = requestAnimationFrame(this.frame)
  }

  handleWindowState = () => {
    const minimized = window.innerWidth === 0 || window.innerHeight === 0
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

    this.renderer.render(this.localWorld, now)
    this.rafId = requestAnimationFrame(this.frame)
  }
}
