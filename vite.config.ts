import { defineConfig } from "vite";

const target = process.env.BUILD_TARGET || "all";
// Preserve the Vite 7 browser targets for Anki's reviewer and editor WebViews.
const browsers = ["chrome107", "edge107", "firefox104", "safari16"];

const renderer = defineConfig({
  build: {
    target: browsers,
    lib: {
      entry: "src/render.ts",
      formats: ["es"],
      fileName: () => "_review.js",
    },
    outDir: "anki_markdown",
    emptyOutDir: false,
    rolldownOptions: {
      // Keep dynamic imports external - they load from collection.media at runtime
      external: (id) => {
        // Match ./_lang-*.js and ./_theme-*.js dynamic imports
        return /^\.\/_(?:lang|theme)-.*\.js$/.test(id);
      },
      output: {
        assetFileNames: "_review[extname]",
        codeSplitting: false,
      },
    },
  },
});

const editor = defineConfig({
  build: {
    target: browsers,
    lib: {
      entry: "src/editor.ts",
      formats: ["es"],
      fileName: () => "web/editor.js",
    },
    outDir: "anki_markdown",
    emptyOutDir: false,
    rolldownOptions: {
      external: (id) => /^(anki|svelte)(\/|$)/.test(id),
      output: {
        assetFileNames: "web/editor[extname]",
      },
    },
  },
});

export default target === "editor" ? editor : renderer;
