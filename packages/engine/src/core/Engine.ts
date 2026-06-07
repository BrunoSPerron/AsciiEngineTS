import { World } from '../world/World'
import { ActionManager } from '../input/ActionManager'
import { ContextManager } from '../input/ContextManager'
import { PointerManager } from '../input/PointerManager'
import { Renderer } from '../render/Renderer'
import { loadConfig } from './Config'
import type { EngineConfig } from './Config'
import { loadGameAssets, type GameAssets } from './GameAssets'
import { CHUNK_SIZE } from '../world/Chunk'

export class AsciiEngine {
  private _container: HTMLDivElement
  private _gameContainer: HTMLDivElement
  assets!: GameAssets
  config!: EngineConfig

  private _boundContextMenu: ((e: PointerEvent) => void) | null = null
  private _boundTabKey: ((e: KeyboardEvent) => void) | null = null

  private _unlistenCycleFocus: (() => void) | null = null

  world: World
  renderer: Renderer

  actionManager: ActionManager
  pointerManager: PointerManager
  contextManager: ContextManager

  private _running = false
  private _paused = false

  private environmentReady = false
  private pausedTimeouts: Map<number, number> = new Map()

  constructor(root: HTMLDivElement, glob: Record<string, string> = {}) {
    this.assets = loadGameAssets(glob)

    this._container = root
    root.classList.add('ascii-game-engine-host')

    this._gameContainer = document.createElement('div')
    this._gameContainer.classList.add('ascii-game-engine')
    root.appendChild(this._gameContainer)

    this.world = new World()

    this.renderer = new Renderer()

    this.contextManager = new ContextManager()
    this.actionManager = new ActionManager()
    this.pointerManager = new PointerManager()

    document.addEventListener('visibilitychange', this.handleVisibility)
    window.addEventListener('resize', this.handleResize)
  }

  get paused() {
    return this._paused || !this._running
  }

  get gameContainer(): HTMLDivElement {
    return this._gameContainer
  }

  async init() {
    this.config = await loadConfig(this.assets.configUrl)
    await document.fonts.ready
    this._setupContextMenu(this.config.game.disable_context_menu)

    this.actionManager._init(this)
    this.pointerManager._init(this)
    this.world._init(this)
    this.renderer._init(this)

    this._boundTabKey = (e: KeyboardEvent) => {
      if (e.code === 'Tab') e.preventDefault()
    }
    window.addEventListener('keydown', this._boundTabKey)
    this._unlistenCycleFocus = this.actionManager.onActionKeyDown((action) => {
      if (action === 'cycle_focus') this.contextManager.cycleFocus(1)
      // TODO Shift+Tab would need a separate 'cycle_focus_back' binding, or
      // ActionManager could detect shift state.
    })
  }

  start() {
    const initPos = this.renderer.camera.target.pos
    const initCx = Math.floor(initPos.x / CHUNK_SIZE)
    const initCy = Math.floor(initPos.y / CHUNK_SIZE)
    this.world.updateActiveChunks(initCx, initCy)
    this.renderer.camera.jumpToTarget()

    this.environmentReady = true
    this.schedule()
  }

  destroy() {
    this.suspend()
    this.world.local.entities.forEach((e) => e.unschedule())
    this.pointerManager?.destroy()
    this._unlistenCycleFocus?.()

    document.removeEventListener('visibilitychange', this.handleVisibility)
    window.removeEventListener('resize', this.handleResize)
  }

  pause() {
    if (this._paused) return
    this.pausedTimeouts.clear()
    this._paused = true
    this.world.local.entities.forEach((e) => {
      this.pausedTimeouts.set(e.uid, e.unschedule())
    })
  }

  unpause() {
    if (!this._paused) return
    this._paused = false
    this.world.local.entities.forEach((e) => {
      e.scheduleFirst(this.pausedTimeouts.get(e.uid))
    })
  }

  private suspend = () => {
    if (!this._running) return
    this._running = false
    this.renderer.camera.suspend()
    this.world.local.entities.forEach((e) => e.unschedule())
  }

  private schedule = () => {
    if (this._running) return
    if (document.hidden) return
    if (!this.environmentReady) return
    this._running = true
    this.renderer.camera.resume()
    if (!this._paused) this.world.local.entities.forEach((e) => e.scheduleFirst())
  }

  /**
   *  Disable "right click" menu
   */
  private _setupContextMenu(disabled: boolean): void {
    if (this._boundContextMenu) {
      this._container.removeEventListener('contextmenu', this._boundContextMenu)
      this._boundContextMenu = null
    }
    if (disabled) {
      this._boundContextMenu = (e: PointerEvent) => {
        e.preventDefault()
      }
    } else {
      this._boundContextMenu = () => {
        this.actionManager.clearAllKeyDown()
      }
    }
    this._container.addEventListener('contextmenu', this._boundContextMenu)
  }

  private handleResize = () => {
    this.renderer.ui.resized()
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
