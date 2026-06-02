/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    // Property-based tests (fast-check) run >=100 iterations; allow ample time.
    testTimeout: 30_000,
    // Keep Playwright E2E specs out of the Vitest run.
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
  },
});
