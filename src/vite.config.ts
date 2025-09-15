import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    proxy: {
      "/api/openai": {
        target: "https://api.openai.com",
        changeOrigin: true,
        secure: true,
        rewrite: p => p.replace(/^\/api\/openai/, ""),
      },
      "/api/deepseek": {
        target: "https://api.deepseek.com",
        changeOrigin: true,
        secure: true,
        rewrite: p => p.replace(/^\/api\/deepseek/, ""),
      },
      "/api/backend": {
        target: "http://localhost:8787",
        changeOrigin: true,
        rewrite: p => p.replace(/^\/api\/backend/, ""),
      },
      "/api/subtitle": {
        target: "http://localhost:8787",
        changeOrigin: true,
        rewrite: p => p.replace(/^\/api\/subtitle/, "/subtitle"),
      },
    },
  },
});
