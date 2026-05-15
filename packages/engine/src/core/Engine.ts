import { World } from '../world/World'
import { Camera } from '../render/Camera'
import { InputManager } from './InputManager'
import { Renderer } from '../render/Renderer'
import { loadConfig } from './Config'
import type { EngineConfig } from './Config'
import { loadGameAssets, type GameAssets } from './GameAssets'
import { CHUNK_SIZE } from '../world/Chunk'

export class AsciiEngine {
  assets: GameAssets

  world: World

  inputManager: InputManager
  renderer: Renderer

  config!: EngineConfig

  running = false
  paused = false

  private environmentReady = false
  private pausedTimeouts: Map<number, number> = new Map()

  constructor(root: HTMLDivElement, glob: Record<string, string> = {}) {
    this.assets = loadGameAssets(glob)
    root.classList.add('ascii-engine-host')
    const gameContainer = document.createElement('div')
    gameContainer.classList.add('ascii-engine')
    root.appendChild(gameContainer)

    this.world = new World(this)

    this.inputManager = new InputManager()

    const tileMetrics = { w: 19.90625, h: 18 }

    const camera = new Camera(gameContainer, tileMetrics)
    camera.onChunksInvalidated(() => this.renderer.invalidateChunks())

    this.renderer = new Renderer(gameContainer, camera, this.inputManager, tileMetrics)

    document.addEventListener('visibilitychange', this.handleVisibility)
    window.addEventListener('resize', this.handleWindowState)
  }

  async start() {
    this.config = await loadConfig(this.assets.configUrl)
    this.renderer.camera.halfLife = this.config.camera.half_life
    this.renderer.camera.setInitialPosition(...this.config.camera.initial_position)
    this.renderer.viewDistance = this.config.world.chunk_view_distance

    document.title = this.config.game.title

    for (const { name, url } of this.assets.themes) {
      this.renderer.themeManager.register(name, url)
    }
    this.renderer.themeManager.set(this.config.game.start_theme)

    await document.fonts.ready

    this.renderer.setTileHAndW()
    this.renderer.bindWorld(this.world)
    const initPos = this.config.camera.initial_position
    const initCx = Math.floor(initPos[0] / CHUNK_SIZE)
    const initCy = Math.floor(initPos[1] / CHUNK_SIZE)
    this.world.updateActiveChunks(initCx, initCy, this.renderer.viewDistance)
    this.renderer.camera.jumpToTarget()

    this.environmentReady = true
    this.schedule()
  }

  destroy() {
    this.suspend()
    this.world.local.entities.forEach((e) => e.unschedule())

    document.removeEventListener('visibilitychange', this.handleVisibility)
    window.removeEventListener('resize', this.handleWindowState)
  }

  pause() {
    if (this.paused) return
    this.pausedTimeouts.clear()
    this.paused = true
    this.world.local.entities.forEach((e) => {
      this.pausedTimeouts.set(e.uid, e.unschedule())
    })
  }

  unpause() {
    if (!this.paused) return
    this.paused = false
    this.world.local.entities.forEach((e) => {
      e.scheduleFirst(this.pausedTimeouts.get(e.uid))
    })
  }

  private suspend = () => {
    if (!this.running) return
    this.running = false
    this.renderer.camera.suspend()
    this.world.local.entities.forEach((e) => e.unschedule())
  }

  private schedule = () => {
    if (this.running) return
    if (document.hidden) return
    if (!this.environmentReady) return
    this.running = true
    this.renderer.camera.resume()
    if (!this.paused) this.world.local.entities.forEach((e) => e.scheduleFirst())
  }

  private handleWindowState = () => {
    const minimized = window.innerWidth === 0 || window.innerHeight === 0
    if (minimized || document.hidden) {
      this.suspend()
    } else {
      this.schedule()
    }
  }

  private handleVisibility = () => {
    if (document.hidden) {
      this.suspend()
    } else {
      this.schedule()
    }
  }
}
