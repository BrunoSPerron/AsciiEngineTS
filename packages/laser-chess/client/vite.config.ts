import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      'ascii-game-engine': resolve(__dirname, '../../engine/src/index.ts'),
      '@laser-chess/shared': resolve(__dirname, '../shared/src/index.ts'),
    },
  },
})
