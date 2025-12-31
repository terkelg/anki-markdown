import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main.ts',
      formats: ['es'],
      fileName: () => '_anki-md.js'
    },
    outDir: 'anki_markdown',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        assetFileNames: '_anki-md[extname]'
      }
    }
  }
})
