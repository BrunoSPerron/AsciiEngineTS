import { AsciiEngine } from './engine/core/Engine'
import './style.css'

const root = document.querySelector<HTMLDivElement>('#asciiEngine')!
const engine = new AsciiEngine(root)
await engine.start()
