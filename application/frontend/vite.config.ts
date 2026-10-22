import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// In development the API runs on :3000; proxying keeps the browser same-origin (cookies, no CORS).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/healthz": "http://localhost:3000",
      "/readyz": "http://localhost:3000",
    },
  },
  build: {
    sourcemap: false,
    // The 3D chunk (three.js) is loaded lazily by the hero only; the initial bundle stays small.
    chunkSizeWarningLimit: 1100,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    testTimeout: 15000,
  },
});
