import { World } from '../world/World'
import { Camera } from '../render/Camera'
import { ActionManager } from './ActionManager'
import { ContextManager } from './ContextManager'
import { MouseManager } from './MouseManager'
import { Renderer } from '../render/Renderer'
import { loadConfig } from './Config'
import type { EngineConfig } from './Config'
import { loadGameAssets, type GameAssets } from './GameAssets'
import { CHUNK_SIZE } from '../world/Chunk'

export class AsciiEngine {
  assets: GameAssets

  world: World

  contextManager: ContextManager
  actionManager!: ActionManager
  mouseManager!: MouseManager
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

    this.contextManager = new ContextManager()

    const tileMetrics = { w: 19.90625, h: 18 }

    const camera = new Camera(gameContainer, tileMetrics)
    camera.onChunksInvalidated(() => this.renderer.invalidateChunks())

    this.renderer = new Renderer(gameContainer, camera, tileMetrics)

    document.addEventListener('visibilitychange', this.handleVisibility)
    window.addEventListener('resize', this.handleWindowState)
  }

  async init() {
    this.config = await loadConfig(this.assets.configUrl)
    document.title = this.config.game.title
    await document.fonts.ready

    this.actionManager = new ActionManager(this.config.bindings, this.contextManager)
    this.renderer.init(
      this.world,
      this.actionManager,
      this.contextManager,
      this.config,
      this.assets,
    )

    this.mouseManager = new MouseManager(
      this.renderer.root,
      this.renderer.tileMetrics,
      this.renderer.camera,
      this.contextManager,
      this.renderer.uiLayer!,
    )
    this.renderer.uiLayer!.mouseManager = this.mouseManager
  }

  start() {
    const initPos = this.renderer.camera.target.pos
    const initCx = Math.floor(initPos.x / CHUNK_SIZE)
    const initCy = Math.floor(initPos.y / CHUNK_SIZE)
    this.world.updateActiveChunks(initCx, initCy, this.renderer.viewDistance)
    this.renderer.camera.jumpToTarget()

    this.environmentReady = true
    this.schedule()
  }

  destroy() {
    this.suspend()
    this.world.local.entities.forEach((e) => e.unschedule())
    this.mouseManager?.destroy()

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
