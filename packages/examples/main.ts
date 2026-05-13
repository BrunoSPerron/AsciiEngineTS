import { AsciiEngine } from 'ascii-engine'
import { Menu } from 'ascii-engine/src/render/Menu'
import './style.css'
import { PlayerUnit } from './basic/world/entities/PlayerUnit'

const container = document.querySelector<HTMLDivElement>('#asciiEngine')!
const assets: Record<string, string> = import.meta.glob('./game/**/*', {
  query: '?url',
  eager: true,
  import: 'default',
})
const engine = new AsciiEngine(container, assets)
await engine.start()

const menu = new Menu(engine.renderer)
menu.register('Option 1', () => {
  /* TODO */
})
menu.registerPaletteSelect()
menu.register('Option 2', () => {
  /* TODO */
})

engine.inputManager.onKeyDown((e) => {
  if (e.key === 'Escape') void menu.open()
})

const unit = engine.world.spawnEntity(new PlayerUnit('☺', 20, 20, 80))
engine.renderer.camera.target = unit
