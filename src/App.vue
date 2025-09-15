<script setup lang="ts">
import { onMounted } from "vue";
import { useAppStore } from "./stores/app";
const store = useAppStore();
onMounted(() => store.loadFromLocal());
</script>

<template>
  <div class="min-h-screen">
    <header class="border-b sticky top-0 z-50 bg-white">
      <nav class="max-w-6xl mx-auto flex items-center justify-between p-4">
        <a href="/" class="font-semibold">Matrix Studio</a>
        <div class="flex items-center gap-4">
          <router-link to="/" class="text-sm hover:underline">Home</router-link>
          <router-link to="/settings" class="text-sm hover:underline">Settings</router-link>
          <router-link to="/styles" class="text-sm hover:underline">风格库</router-link>
          <router-link to="/webstyles" class="hover:underline">Web风格库</router-link>
          <router-link to="/workspace" class="text-sm hover:underline">工作区</router-link>
          <router-link to="/projects" class="text-sm hover:underline">项目</router-link>
          <router-link to="/play" class="text-sm hover:underline">Playground</router-link>
          <router-link to="/workflows" class="text-sm hover:underline">Workflows</router-link>
          <router-link to="/templates" class="text-sm hover:underline">Templates</router-link>
          <router-link to="/assets" class="text-sm hover:underline">Assets</router-link>
          <span class="text-xs text-gray-500">
            {{ store.provider ? store.provider : '未选择' }} ·
            {{ store.apiKeyMasked ? '已配置' : '未配置' }}
          </span>
        </div>
      </nav>
    </header>
    <main class="max-w-6xl mx-auto p-4">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.router-link-active { text-decoration: underline; }
</style>
