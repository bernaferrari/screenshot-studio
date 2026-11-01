import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

/** Records the packages the bundle really contains, so install-ui.mjs ships exactly their license notices. */
function bundledPackages() {
  return {
    name: "bundled-packages",
    generateBundle() {
      const packages = new Set();
      for (const id of this.getModuleIds()) {
        const match = id.match(/^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)\//);
        if (match) packages.add(path.relative(process.cwd(), match[1]));
      }
      this.emitFile({ type: "asset", fileName: "bundled-packages.json", source: JSON.stringify([...packages].sort(), null, 2) });
    },
  };
}
export default defineConfig({
  plugins: [react(), tailwindcss(), bundledPackages()],
  resolve: { alias: { "@": path.resolve("ui/src") } },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: ".ui-build",
    emptyOutDir: true,
    lib: {
      entry: "ui/src/main.tsx",
      name: "ScreenshotStudio",
      formats: ["iife"],
      fileName: () => "studio.js",
      cssFileName: "studio",
    },
  },
});
