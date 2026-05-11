import { AsciiEngine, loadGameAssets } from 'ascii-engine'
import './style.css'

const container = document.querySelector<HTMLDivElement>('#asciiEngine')!

const assets = loadGameAssets({
  themes: import.meta.glob('./game/themes/*.css', {
    query: '?url',
    eager: true,
    import: 'default',
  }),
})

const engine = new AsciiEngine(container, 'my-game', assets)
await engine.start()
