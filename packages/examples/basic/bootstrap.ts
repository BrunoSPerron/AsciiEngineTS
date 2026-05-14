import { AsciiEngine } from 'ascii-engine'
import { Game } from './Game'

export async function bootstrap() {
  const container = document.querySelector<HTMLDivElement>('#asciiEngine')

  if (!container) {
    throw new Error('#asciiEngine container not found')
  }

  const assets: Record<string, string> = import.meta.glob('./assets/**/*', {
    query: '?url',
    eager: true,
    import: 'default',
  })

  const engine = new AsciiEngine(container, assets)

  await engine.start()

  const game = new Game(engine)

  game.initialize()
}
