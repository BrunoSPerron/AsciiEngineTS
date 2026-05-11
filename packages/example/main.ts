import { AsciiEngine } from 'ascii-engine'
import './style.css'

const container = document.querySelector<HTMLDivElement>('#asciiEngine')!
const assets: Record<string, string> = import.meta.glob('./game/**/*', {
  query: '?url',
  eager: true,
  import: 'default',
})
const engine = new AsciiEngine(container, assets)

await engine.start()
