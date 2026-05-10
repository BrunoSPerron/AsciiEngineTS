import { AsciiEngine } from 'ascii-engine'
import './style.css'

const root = document.querySelector<HTMLDivElement>('#asciiEngine')!
const engine = new AsciiEngine(root)
await engine.start()
