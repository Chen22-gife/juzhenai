<script setup lang="ts">
import { ref } from "vue";
import { listProjects, removeProject, exportProjectJSON, importProjectFromJSON } from "../lib/projectStore";
import { useRouter } from "vue-router";

const router = useRouter();
const list = ref(listProjects());

function refresh(){ list.value = listProjects(); }
function open(pid: string){ router.push({ name: "workspace", query: { pid } }); }
function del(pid: string){ if(!confirm("删除该项目？")) return; removeProject(pid); refresh(); }
function exportOne(pid: string){
  const json = exportProjectJSON(pid);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "project-"+pid+".json";
  a.click(); URL.revokeObjectURL(url);
}
async function importOne(ev: Event){
  const file = (ev.target as HTMLInputElement).files?.[0]; if(!file) return;
  const text = await file.text(); const p = importProjectFromJSON(text);
  refresh(); open(p.id);
}
</script>

<template>
  <div class="p-8 max-w-6xl">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold">项目列表</h2>
      <label class="text-sm border rounded px-3 py-2 cursor-pointer">
        导入JSON
        <input type="file" class="hidden" accept="application/json" @change="importOne" />
      </label>
    </div>
    <p class="text-sm text-gray-600 mt-1">本地存档（保存在浏览器）。可打开到工作区、导出/导入 JSON。</p>

    <div class="mt-4 space-y-2">
      <div v-if="!list.length" class="text-gray-500 text-sm">暂无项目。</div>
      <div v-for="p in list" :key="p.id" class="border rounded p-3">
        <div class="flex items-center justify-between">
          <div class="font-medium">{{ p.name }}</div>
          <div class="text-xs text-gray-500">{{ new Date(p.updatedAt).toLocaleString() }}</div>
        </div>
        <div class="mt-2 flex flex-wrap gap-2 text-sm">
          <button class="px-3 py-1 border rounded" @click="open(p.id)">打开到工作区</button>
          <button class="px-3 py-1 border rounded" @click="exportOne(p.id)">导出JSON</button>
          <button class="px-3 py-1 border rounded text-red-600" @click="del(p.id)">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>
