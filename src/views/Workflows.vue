<script setup lang="ts">
import { ref, computed, watchEffect } from "vue";
import { getApiBase, getKey, getProvider } from "../lib/byok";
import { type WorkflowTemplate, type WorkflowPack } from "../lib/templates";
import { runWorkflow, validateVars } from "../lib/workflow";
import { modelsFor } from "../lib/models";
import { listAllTemplates } from "../lib/tplStore";
import { renderMarkdown } from "../lib/markdown";

const templates = ref<WorkflowTemplate[]>(listAllTemplates());
const selectedId = ref<string>(templates.value[0]?.id || "");
const tpl = computed(() => templates.value.find(t => t.id === selectedId.value) || null);

const varsMap = ref<Record<string,string>>({});
const loading = ref(false);
const error = ref<string | null>(null);
const output = ref<string>("");
const outputHtml = computed(() => renderMarkdown(output.value));
const usage = ref<any | null>(null);
const latencyMs = ref<number | null>(null);
const cost = ref<{ currency: string; promptCost: number; completionCost: number; total: number } | null>(null);

const provider = computed(() => getProvider());
const modelList = computed(() => provider.value ? modelsFor(provider.value) : []);
const model = ref<string>("");

function reloadTemplates() {
  templates.value = listAllTemplates();
  if (!templates.value.find(t => t.id === selectedId.value)) {
    selectedId.value = templates.value[0]?.id || "";
  }
}

function initForm() {
  varsMap.value = {};
  if (tpl.value?.vars?.length) for (const v of tpl.value.vars) varsMap.value[v.key] = "";
  if (provider.value) {
    if (tpl.value?.defaultModel && modelList.value.find(m => m.id === tpl.value!.defaultModel)) {
      model.value = tpl.value!.defaultModel!;
    } else {
      model.value = modelList.value[0]?.id || "";
    }
  } else model.value = "";
}
watchEffect(() => { if (tpl.value) initForm(); });

function onTemplateChange() {
  output.value = ""; usage.value = null; latencyMs.value = null; cost.value = null; error.value = null;
  initForm();
}

async function generate() {
  error.value = null; output.value = ""; usage.value = null; latencyMs.value = null; cost.value = null;

  const p = provider.value, base = getApiBase(), key = getKey();
  if (!p || !key) { error.value = "请先在 Settings 配置 Provider 与 API Key"; return; }
  if (!tpl.value) { error.value = "未选择模板"; return; }
  if (!model.value) { error.value = "当前 Provider 下无可用模型（请去 Settings 切换 Provider）"; return; }

  const msg = validateVars(tpl.value, varsMap.value);
  if (msg) { error.value = msg; return; }

  loading.value = true;
  try {
    const res = await runWorkflow(p, base, key, model.value, tpl.value, varsMap.value);
    output.value = res.content?.trim() || "";
    usage.value = res.usage; latencyMs.value = res.latencyMs; cost.value = res.cost;
  } catch (e: any) {
    error.value = e?.message || String(e);
  } finally { loading.value = false; }
}

function copyOutput() { navigator.clipboard.writeText(output.value || "").catch(() => {}); }
</script>

<template>
  <div class="p-8 max-w-5xl">
    <div class="mb-3 p-2 bg-yellow-50 border rounded">
      ✅ Workflows 页面已加载
    </div>

    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold">Workflows：模板化生成</h2>
      <div class="flex items-center gap-2">
        <router-link to="/templates" class="text-sm underline">编辑模板</router-link>
        <button class="text-sm underline" @click="reloadTemplates">刷新模板库</button>
      </div>
    </div>
    <p class="text-sm text-gray-600 mt-2">从模板库选择工作流，填入变量，一键生成。支持导出/导入 JSON。</p>

    <div class="mt-4 text-xs text-gray-600">
      <div>Provider：<b>{{ provider || "未配置（请去 Settings）" }}</b> · 模板数：<b>{{ templates.length }}</b></div>
    </div>

    <div class="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="md:col-span-1 space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">选择模板</label>
          <select v-model="selectedId" @change="onTemplateChange" class="w-full border rounded-lg p-2">
            <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
          <p class="text-xs text-gray-500 mt-1" v-if="tpl">{{ tpl.description }}</p>
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">模型</label>
          <select v-model="model" class="w-full border rounded-lg p-2" :disabled="!provider || !modelList.length">
            <option v-for="m in modelList" :key="m.id" :value="m.id">{{ m.display }}</option>
          </select>
        </div>

        <div v-if="tpl">
          <label class="block text-sm font-medium mb-1">变量</label>
          <div class="space-y-3">
            <div v-for="v in tpl.vars" :key="v.key" class="space-y-1">
              <label class="text-xs text-gray-600">{{ v.label }} <span v-if="v.required" class="text-red-500">*</span></label>
              <textarea v-model="varsMap[v.key]" rows="2" :placeholder="v.placeholder" class="w-full border rounded-lg p-2"></textarea>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <button :disabled="loading" @click="generate" class="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-60">
            {{ loading ? "生成中…" : "生成" }}
          </button>
          <button :disabled="!output" @click="copyOutput" class="px-3 py-2 border rounded-lg">复制输出</button>
        </div>

        <p v-if="error" class="text-red-600 text-sm">{{ error }}</p>
      </div>

      <div class="md:col-span-2">
        <div class="border rounded-xl p-4 min-h-[240px]">
          <template v-if="output">
            <div v-html="outputHtml"></div>
          </template>
          <p v-else class="text-gray-500 text-sm">结果将显示在这里…</p>
        </div>
        <div v-if="latencyMs !== null || usage || cost" class="mt-3 text-xs text-gray-600 space-y-1">
          <div v-if="latencyMs !== null">耗时：{{ latencyMs }} ms</div>
          <div v-if="usage">用量：prompt {{ usage?.prompt_tokens ?? 0 }} · completion {{ usage?.completion_tokens ?? 0 }} · total {{ usage?.total_tokens ?? (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0) }}</div>
          <div v-if="cost">预估费用：{{ cost.currency }} {{ cost.total?.toFixed(6) }}（prompt {{ cost.promptCost?.toFixed(6) }} + completion {{ cost.completionCost?.toFixed(6) }}）</div>
        </div>
      </div>
    </div>
  </div>
</template>
