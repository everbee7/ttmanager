import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: "apps/desktop/renderer",
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/desktop/renderer/src"),
      "@shared": path.resolve(__dirname, "packages/shared-types/src")
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/rpc": {
        target: "http://127.0.0.1:39111",
        changeOrigin: false
      }
    }
  },
  test: {
    environment: "jsdom",
    globals: true
  }
});
