import { defineConfig } from 'vite'

const target = process.env.BUILD_TARGET || 'all'

const renderer = defineConfig({
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

const editor = defineConfig({
  build: {
    lib: {
      entry: 'src/editor/index.ts',
      formats: ['es'],
      fileName: () => 'web/editor.js'
    },
    outDir: 'anki_markdown',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        assetFileNames: 'web/editor[extname]'
      }
    }
  }
})

export default target === 'editor' ? editor : renderer
