import './style.css'
import { bootstrap } from './action/bootstrap'

const container = document.querySelector<HTMLDivElement>('#asciiEngine')
if (!container) {
  throw new Error('#asciiEngine container not found')
}
await bootstrap(container)
