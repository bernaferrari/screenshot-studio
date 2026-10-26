import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve("ui/src") } },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: ".ui-build",
    emptyOutDir: true,
    lib: {
      entry: "ui/src/main.jsx",
      name: "ScreenshotStudio",
      formats: ["iife"],
      fileName: () => "studio.js",
      cssFileName: "studio",
    },
  },
});
