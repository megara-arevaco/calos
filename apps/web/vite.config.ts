import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  build: { outDir: resolve(import.meta.dirname, "dist"), emptyOutDir: true },
  server: { proxy: { "/api": "http://127.0.0.1:3002" } },
});
