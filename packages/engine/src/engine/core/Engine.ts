import { World } from '../world/World'
import { Camera } from '../render/Camera'
import { PlayerUnit } from '../world/entities/PlayerUnit'
import { InputManager } from './InputManager'
import { Renderer } from '../render/Renderer'
import { DefaultMenu } from '../render/DefaultMenu'
import { loadConfig } from './Config'
import type { EngineConfig } from './Config'
import { loadGameAssets, type GameAssets } from './GameAssets'

export class AsciiEngine {
  assets: GameAssets

  world: World

  inputManager: InputManager
  renderer: Renderer

  config!: EngineConfig

  running = false
  paused = false

  private environmentReady = false

  constructor(root: HTMLDivElement, glob: Record<string, string> = {}) {
    this.assets = loadGameAssets(glob)
    root.classList.add('ascii-engine-host')
    const gameContainer = document.createElement('div')
    gameContainer.classList.add('ascii-engine')
    root.appendChild(gameContainer)

    this.world = new World(this)

    this.inputManager = new InputManager()

    // Initial values correspond to the default css
    // This is dynamic. See this.renderer.setTileHAndW()
    const tileMetrics = { w: 19.90625, h: 18 }

    const cameraTarget = this.world.spawnEntity(new PlayerUnit('☺', 20, 20, 250))
    const camera = new Camera(gameContainer, cameraTarget, tileMetrics)
    camera.onChunksInvalidated = () => this.renderer.invalidateChunks()

    this.renderer = new Renderer(gameContainer, camera, this.inputManager, tileMetrics)

    document.addEventListener('visibilitychange', this.handleVisibility)
    window.addEventListener('resize', this.handleWindowState)
  }

  async start() {
    this.config = await loadConfig(this.assets.configUrl)
    this.renderer.viewDistance = this.config.world.chunk_view_distance

    document.title = this.config.game.title

    for (const { name, url } of this.assets.themes) {
      this.renderer.themeManager.register(name, url)
    }
    this.renderer.themeManager.set(this.config.game.start_theme)

    await document.fonts.ready

    this.renderer.setTileHAndW()
    this.environmentReady = true
    this.renderer.bindWorld(this.world)
    this.renderer.camera.jumpToTarget()

    new DefaultMenu(this.inputManager, this.renderer)

    this.resume()
  }

  destroy() {
    this.suspend()
    this.world.local.entities.forEach((e) => e.unschedule())

    document.removeEventListener('visibilitychange', this.handleVisibility)
    window.removeEventListener('resize', this.handleWindowState)
  }

  pause() {
    if (this.paused) return
    this.paused = true
    this.world.local.entities.forEach((e) => e.unschedule())
  }

  unpause() {
    if (!this.paused) return
    this.paused = false
    this.world.local.entities.forEach((e) => e.scheduleFirst(this))
  }

  suspend = () => {
    if (!this.running) return
    this.running = false
    this.renderer.camera.suspend()
    this.world.local.entities.forEach((e) => e.unschedule())
  }

  resume = () => {
    if (this.running) return
    if (document.hidden) return
    if (!this.environmentReady) return
    this.running = true
    this.renderer.camera.resume()
    if (!this.paused) this.world.local.entities.forEach((e) => e.scheduleFirst(this))
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
}
