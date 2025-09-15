import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      // 开发时前端调用 OpenAI：fetch("/api/openai/v1/...")
      "/api/openai": {
        target: "https://api.openai.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/openai/, ""),
      },
      // 开发时前端调用 DeepSeek：fetch("/api/deepseek/v1/...")
      "/api/deepseek": {
        target: "https://api.deepseek.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/deepseek/, ""),
      },
      // 你的本地后端（签名 & 其他服务）
      "/api/backend": {
        target: "http://localhost:8787",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/backend/, ""),
      },
      // 字幕服务代理：/api/subtitle/* -> http://localhost:8787/subtitle/*
      "/api/subtitle": {
        target: "http://localhost:8787",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/subtitle/, "/subtitle"),
      },
    },
  },
});
