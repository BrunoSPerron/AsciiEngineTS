import { AsciiEngine } from 'ascii-engine'
import './style.css'
import { PlayerUnit } from './game/world/entities/PlayerUnit'

const container = document.querySelector<HTMLDivElement>('#asciiEngine')!
const assets: Record<string, string> = import.meta.glob('./game/**/*', {
  query: '?url',
  eager: true,
  import: 'default',
})
const engine = new AsciiEngine(container, assets)
await engine.start()

const unit = engine.world.spawnEntity(new PlayerUnit('☺', 20, 20, 80))
engine.renderer.camera.target = unit
