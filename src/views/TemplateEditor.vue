<script setup lang="ts">
import { ref, computed } from "vue";
import type { WorkflowTemplate, VarSpec } from "../lib/templates";
import { upsertTemplate, removeTemplate, listAllTemplates } from "../lib/tplStore";
import { modelsFor } from "../lib/models";
import { getProvider } from "../lib/byok";
import { renderMarkdown } from "../lib/markdown";
import { runWorkflow, validateVars } from "../lib/workflow";
import { getApiBase, getKey } from "../lib/byok";

const provider = computed(() => getProvider());
const modelList = computed(() => provider.value ? modelsFor(provider.value) : []);

const all = ref<WorkflowTemplate[]>(listAllTemplates());
const currentId = ref<string>(all.value[0]?.id || "");
const current = ref<WorkflowTemplate>(all.value[0] || {
  id: "my-template",
  name: "未命名模板",
  description: "",
  defaultModel: modelList.value[0]?.id,
  vars: [{ key: "topic", label: "主题", required: true, placeholder: "比如：便携榨汁杯" }],
  system: "你是专业文案助手。",
  user: "请为主题：{{topic}} 生成一段30-80字的中文介绍。",
});

function loadById() {
  const t = all.value.find(x => x.id === currentId.value);
  if (t) current.value = JSON.parse(JSON.stringify(t));
}

function newTemplate() {
  current.value = {
    id: "my-template-" + Math.random().toString(36).slice(2, 7),
    name: "未命名模板",
    description: "",
    defaultModel: modelList.value[0]?.id,
    vars: [{ key: "topic", label: "主题", required: true, placeholder: "比如：便携榨汁杯" }],
    system: "你是专业文案助手。",
    user: "请为主题：{{topic}} 生成一段30-80字的中文介绍。",
  };
}

function addVar() {
  (current.value.vars as VarSpec[]).push({ key: "var" + (current.value.vars.length + 1), label: "新变量", required: false, placeholder: "" });
}
function removeVar(i: number) {
  (current.value.vars as VarSpec[]).splice(i, 1);
}

function save() {
  if (!current.value.id.trim()) return alert("请填写唯一 id");
  if (!current.value.name.trim()) return alert("请填写模板名称");
  upsertTemplate(current.value);
  all.value = listAllTemplates();
  currentId.value = current.value.id;
  alert("已保存");
}

function del() {
  if (!confirm("确认删除该模板？")) return;
  removeTemplate(current.value.id);
  all.value = listAllTemplates();
  currentId.value = all.value[0]?.id || "";
  loadById();
}

// 预览
const previewVars = ref<Record<string,string>>({});
const previewLoading = ref(false);
const previewHtml = ref("");
const previewError = ref<string | null>(null);

async function runPreview() {
  previewError.value = null;
  previewHtml.value = "";
  if (!provider.value) { previewError.value = "请先在 Settings 配置 Provider/Key"; return; }
  const model = current.value.defaultModel || modelList.value[0]?.id;
  if (!model) { previewError.value = "当前 Provider 下无可用模型"; return; }

  const msg = validateVars(current.value, previewVars.value);
  if (msg) { previewError.value = msg; return; }

  previewLoading.value = true;
  try {
    const res = await runWorkflow(
      provider.value, getApiBase(), getKey() || "", model, current.value, previewVars.value
    );
    previewHtml.value = renderMarkdown(res.content || "");
  } catch (e: any) {
    previewError.value = e?.message || String(e);
  } finally {
    previewLoading.value = false;
  }
}
</script>

<template>
  <div class="p-8 max-w-6xl">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold">Template Editor</h2>
      <router-link to="/workflows" class="text-sm underline">返回 Workflows</router-link>
    </div>
    <p class="text-sm text-gray-600 mt-2">可视化创建/编辑模板（变量、System/User 提示词），支持预览。</p>

    <div class="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- 左：编辑表单 -->
      <div class="space-y-4">
        <div class="border rounded-xl p-4">
          <div class="flex items-center gap-2">
            <label class="text-sm">从库中载入：</label>
            <select v-model="currentId" @change="loadById" class="border rounded p-2">
              <option v-for="t in all" :key="t.id" :value="t.id">{{ t.name }} ({{ t.id }})</option>
            </select>
            <button class="text-sm underline" @click="newTemplate">新建模板</button>
          </div>
        </div>

        <div class="border rounded-xl p-4 space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-600">模板 ID（唯一）</label>
              <input v-model="current.id" class="w-full border rounded p-2" />
            </div>
            <div>
              <label class="text-xs text-gray-600">模板名称</label>
              <input v-model="current.name" class="w-full border rounded p-2" />
            </div>
          </div>

          <div>
            <label class="text-xs text-gray-600">描述</label>
            <input v-model="current.description" class="w-full border rounded p-2" />
          </div>

          <div>
            <label class="text-xs text-gray-600">默认模型（随 Provider 变化）</label>
            <select v-model="current.defaultModel" class="border rounded p-2">
              <option v-for="m in modelList" :key="m.id" :value="m.id">{{ m.display }}</option>
            </select>
            <p class="text-xs text-gray-500 mt-1">当前 Provider：{{ provider || '未配置' }}</p>
          </div>

          <div>
            <div class="flex items-center justify-between">
              <label class="text-sm font-medium">变量</label>
              <button class="text-xs underline" @click="addVar">添加变量</button>
            </div>
            <div class="space-y-3 mt-2">
              <div v-for="(v,i) in current.vars" :key="i" class="grid grid-cols-4 gap-2 items-center">
                <input v-model="v.key" class="border rounded p-2 col-span-1" placeholder="key" />
                <input v-model="v.label" class="border rounded p-2 col-span-1" placeholder="label" />
                <input v-model="v.placeholder" class="border rounded p-2 col-span-1" placeholder="placeholder" />
                <label class="text-xs flex items-center gap-1 col-span-1"><input type="checkbox" v-model="v.required" /> 必填</label>
                <button class="text-xs text-red-600 underline col-span-4 text-left" @click="removeVar(i)">删除</button>
              </div>
            </div>
          </div>

          <div>
            <label class="text-sm font-medium">System 提示词（可选）</label>
            <textarea v-model="current.system" rows="3" class="w-full border rounded p-2"></textarea>
          </div>
          <div>
            <!-- 关键修复：加 v-pre，按纯文本显示 {{var}} -->
            <label class="text-sm font-medium" v-pre>User 提示词（支持 {{var}} 插值）</label>
            <textarea v-model="current.user" rows="6" class="w-full border rounded p-2"></textarea>
          </div>

          <div class="flex items-center gap-3">
            <button class="px-4 py-2 rounded bg-black text-white" @click="save">保存模板</button>
            <button class="px-3 py-2 rounded border" @click="del">删除模板</button>
          </div>
        </div>
      </div>

      <!-- 右：预览运行 -->
      <div class="space-y-4">
        <div class="border rounded-xl p-4">
          <h3 class="font-medium mb-2">预览变量</h3>
          <div class="space-y-2">
            <div v-for="v in current.vars" :key="v.key">
              <label class="text-xs text-gray-600">{{ v.label }} <span v-if="v.required" class="text-red-500">*</span></label>
              <textarea v-model="(previewVars as any)[v.key]" rows="2" :placeholder="v.placeholder" class="w-full border rounded p-2"></textarea>
            </div>
          </div>
          <button :disabled="previewLoading" class="mt-3 px-4 py-2 rounded bg-black text-white disabled:opacity-60" @click="runPreview">
            {{ previewLoading ? "生成中…" : "生成预览" }}
          </button>
          <p v-if="previewError" class="text-red-600 text-sm mt-2">{{ previewError }}</p>
        </div>

        <div class="border rounded-xl p-4 min-h-[240px]">
          <div v-if="previewHtml" v-html="previewHtml"></div>
          <p v-else class="text-gray-500 text-sm">预览结果会显示在这里（已做 Markdown 渲染与 XSS 清洗）。</p>
        </div>
      </div>
    </div>
  </div>
</template>
