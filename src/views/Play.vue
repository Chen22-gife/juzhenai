<script setup lang="ts">
import { ref, computed } from "vue";
import { getApiBase, getKey, getProvider } from "../lib/byok";
import { generateTitles } from "../lib/aiClient";
import { modelsFor } from "../lib/models";

const topic = ref("");
const loading = ref(false);
const error = ref<string | null>(null);
const results = ref<string[]>([]);
const usage = ref<any | null>(null);
const latencyMs = ref<number | null>(null);
const cost = ref<{ currency: string; promptCost: number; completionCost: number; total: number } | null>(null);

const provider = computed(() => getProvider());
const modelList = computed(() => (provider.value ? modelsFor(provider.value) : []));
const model = ref<string>("");

if (provider.value) {
  const lst = modelList.value;
  model.value = lst[0]?.id || "";
}

async function run() {
  error.value = null;
  results.value = [];
  usage.value = null;
  latencyMs.value = null;
  cost.value = null;

  const p = provider.value;
  const base = getApiBase();
  const key = getKey();

  if (!p || !key) {
    error.value = "请先在 Settings 配置 Provider 与 API Key";
    return;
  }
  if (!model.value) {
    error.value = "请选择模型";
    return;
  }
  if (!topic.value.trim()) {
    error.value = "请输入主题";
    return;
  }

  loading.value = true;
  try {
    const out = await generateTitles(p, base, key, model.value, topic.value.trim(), 5);
    results.value = out.titles;
    usage.value = out.usage;
    latencyMs.value = out.latencyMs;
    cost.value = out.cost;
  } catch (e: any) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="p-8 max-w-2xl">
    <h2 class="text-xl font-semibold">Playground：生成 5 个短视频标题</h2>
    <p class="text-sm text-gray-600 mt-2">确保已在 Settings 页面配置好 Provider、API Base（建议勾选“开发代理”）与 API Key。</p>

    <div class="mt-6 space-y-3">
      <div class="flex gap-2 items-center">
        <label class="text-sm">模型：</label>
        <select v-model="model" class="border rounded-lg p-2">
          <option v-for="m in modelList" :key="m.id" :value="m.id">{{ m.display }}</option>
        </select>
      </div>

      <textarea v-model="topic" rows="4" placeholder="输入主题，例如：便携榨汁杯开箱评测，突出轻便与清洁" class="w-full border rounded-lg p-3"></textarea>

      <button :disabled="loading" @click="run" class="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-60">
        {{ loading ? "生成中…" : "生成标题" }}
      </button>

      <p v-if="error" class="text-red-600 text-sm">{{ error }}</p>

      <ul v-if="results.length" class="mt-4 list-disc pl-6 space-y-1">
        <li v-for="(t,i) in results" :key="i">{{ t }}</li>
      </ul>

      <div v-if="latencyMs !== null || usage || cost" class="mt-4 text-xs text-gray-600 space-y-1">
        <div v-if="latencyMs !== null">耗时：{{ latencyMs }} ms</div>
        <div v-if="usage">用量：prompt {{ usage?.prompt_tokens ?? 0 }} · completion {{ usage?.completion_tokens ?? 0 }} · total {{ usage?.total_tokens ?? (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0) }}</div>
        <div v-if="cost">预估费用：{{ cost.currency }} {{ cost.total.toFixed(6) }}（prompt {{ cost.promptCost.toFixed(6) }} + completion {{ cost.completionCost.toFixed(6) }}）</div>
      </div>
    </div>
  </div>
</template>
