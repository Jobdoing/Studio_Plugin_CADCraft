import { defineConfig } from "vite";
export default defineConfig({
  build: { outDir: ".", emptyOutDir: false, cssCodeSplit: false,
    rollupOptions: { input: "src/main.ts", output: { format: "iife", entryFileNames: "app.js" } }
  }
});
