import { build } from "vite";
import { resolve } from "node:path";

// A classic worker in BOTH dev and production is required by MediaPipe's importScripts loader.
await build({
  configFile: false,
  build: {
    outDir: "public", emptyOutDir: false, copyPublicDir: false,
    lib: { entry: resolve("lib/vision/tracking.worker.ts"), formats: ["iife"], name: "SignalVision", fileName: () => "vision-worker.js" },
    minify: true,
  },
});
