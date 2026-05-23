import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      'ascii-engine': resolve(__dirname, '../engine/src/index.ts'),
    },
  },
})
