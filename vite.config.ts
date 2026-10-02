import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { mediaHelperPlugin } from './scripts/vite-media-helper.ts'

// Crest frontend build. The dev server is also what `tauri dev` loads, so the
// port is fixed and mirrored in src-tauri/tauri.conf.json (devUrl).
export default defineConfig({
  plugins: [react(), mediaHelperPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
  server: {
    host: '127.0.0.1',
    port: 5273,
    strictPort: true,
  },
  build: {
    // WebView2 evergreen on Windows 10/11 -> modern target, no legacy downleveling.
    target: 'chrome110',
    sourcemap: false,
    cssCodeSplit: true,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 900,
  },
})
