import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tanstackStart(),
    viteReact(),
  ],
  ssr: {
    noExternal: [],
    external: ['better-sqlite3'],
  },
  optimizeDeps: {
    exclude: ['better-sqlite3', 'jsdom'],
  },
})