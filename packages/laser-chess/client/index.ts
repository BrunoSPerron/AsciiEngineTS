import { bootstrap } from './src/bootstrap'

const container = document.querySelector<HTMLDivElement>('#asciiEngine')
if (!container) throw new Error('#asciiEngine container not found')
void bootstrap(container)
