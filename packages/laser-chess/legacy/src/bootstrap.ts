import { AsciiEngine } from 'ascii-game-engine'
import { SceneManager } from './SceneManager'

export async function bootstrap(container: HTMLDivElement) {
  const assets: Record<string, string> = import.meta.glob('./assets/**/*', {
    query: '?url',
    eager: true,
    import: 'default',
  })

  const engine = new AsciiEngine(container, assets)
  await engine.init()
  new SceneManager(engine)
  engine.start()
  engine.pause() // Turn based game, entities never need to act()
}
