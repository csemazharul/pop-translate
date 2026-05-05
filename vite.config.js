import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

/**
 * Strip crossorigin attributes from generated HTML tags.
 * Chrome extension pages fail CORS checks on chrome-extension:// URLs
 * when crossorigin is present.
 */
function stripCrossorigin() {
  return {
    name: 'strip-crossorigin',
    transformIndexHtml(html) {
      return html
        .replace(/ crossorigin(="anonymous")?/g, '')
        .replace(/<link rel="modulepreload"[^>]*>\s*/g, '')
    },
  }
}

export default defineConfig({
  plugins: [react(), stripCrossorigin()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'index.html'),
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
