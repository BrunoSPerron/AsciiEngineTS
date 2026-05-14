import './style.css'
import { bootstrap } from './basic/bootstrap'

const container = document.querySelector<HTMLDivElement>('#asciiEngine')
if (!container) {
  throw new Error('#asciiEngine container not found')
}
await bootstrap(container)
