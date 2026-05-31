import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      'ascii-game-engine': resolve(__dirname, '../../engine/src/index.ts'),
      'laser-chess-game-logic': resolve(__dirname, '../game_logic/src/index.ts'),
    },
  },
})
