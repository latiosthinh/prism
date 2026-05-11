import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist/panel",
    rollupOptions: {
      input: "src/panel/index.html",
      output: {
        entryFileNames: "assets/index.js",
        assetFileNames: "assets/index.css",
      },
    },
  },
});
