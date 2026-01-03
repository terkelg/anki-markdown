import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/render.ts',
      formats: ['es'],
      fileName: () => '_review.js'
    },
    outDir: 'anki_markdown',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        assetFileNames: '_review[extname]',
        inlineDynamicImports: true
      }
    }
  }
})
