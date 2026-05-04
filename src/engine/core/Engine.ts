import { LocalWorld } from "../world/LocalWorld"
import { Camera } from "../render/Camera"
import { PlayerUnit } from "../world/entities/PlayerUnit"
import { GlobalWorld } from "../world/GlobalWorld"
import { InputManager } from "./InputManager"
import { Renderer } from "../render/Renderer"
import { TileMetrics } from "../render/TileMetrics"
import { DefaultMenu } from "../render/DefaultMenu"

export const STEP = 1000 / 32
const MAX_FRAME_DELTA = 250
const MAX_UPDATES_PER_FRAME = 8

export class AsciiEngine {
  // Unloaded world data, world simulation called at interval
  globalWorld = new GlobalWorld()

  // Rendered and fully simulated part of the world
  localWorld = new LocalWorld()

  inputManager: InputManager
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

    const cameraTarget = new PlayerUnit("☺", 8, 8, 250)
    //const cameraTarget = new Entity("☺", 8, 8, Number.MAX_SAFE_INTEGER)
    this.localWorld.spawnEntity(cameraTarget)
    const camera = new Camera(gameContainer, cameraTarget)
    this.inputManager = new InputManager()
    this.renderer = new Renderer(gameContainer, camera, this.inputManager)

    document.addEventListener("visibilitychange", this.handleVisibility)
    window.addEventListener("resize", this.handleWindowState)

    this.globalSimulationUpdateCounter = this.globalSimulationInterval;
  }

  start() {
    document.fonts.ready.then(function() {
      this.renderer.setTileHAndW()
      this.environmentReady = true
      this.renderer.camera.jumpToTarget()

      new DefaultMenu(this.inputManager, this.renderer)

      this.resume()
    }.bind(this))
  }

  displayImageTest(x: number, y: number, w: number, h: number, closeDelay = 1000) {
    const uiLayer = this.renderer.uiLayer;

    const url = `https://picsum.photos/${Math.ceil(w * TileMetrics.w)}/${Math.ceil(h * TileMetrics.h)}`;

    const img = new Image();

    img.onload = () => {
      const div: HTMLDivElement = document.createElement('div');
      div.style.width = '100%';
      div.style.height = '100%';
      div.style.backgroundImage = `url("${url}")`;
      div.style.backgroundSize = '100%';

      uiLayer.animatedMenuBoxOpening(
        x, y, w, h, 1000, div
      ).then((menuBoxId: number) => {
        setTimeout(() => {
          uiLayer.animatedMenuBoxClosing(menuBoxId);
        }, closeDelay);
      });
    };

    img.onerror = () => {
      console.error('Image failed to load:', url);
    };

    img.src = url;
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