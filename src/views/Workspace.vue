<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getProvider, getApiBase, getKey } from "../lib/byok";
import { modelsFor } from "../lib/models";
import { extractVars, generateWithStyle, generateSegments, type KV, type Segment } from "../lib/aiTextOps";
import { listStyles } from "../lib/styleStore";
import type { StyleProfile } from "../lib/aiTextOps";
import { renderMarkdown } from "../lib/markdown";
import { upsertProject, getProject, exportProjectJSON, importProjectFromJSON } from "../lib/projectStore";
import { extractTextFromFile } from "../lib/docIngest";
import { exportMarkdown, exportDocx, exportPDFByElementId } from "../lib/exporters";

const route = useRoute(); const router = useRouter();

const provider = computed(() => getProvider());
const modelList = computed(() => provider.value ? modelsFor(provider.value) : []);
const model = ref<string>("");

const projectName = ref<string>("未命名项目");
const currentPid = ref<string | null>(null);

type Sample = { id:string; kind:"text"|"file"; text:string; fileName?:string; fileSize?:number };
function uid(){ return Math.random().toString(36).slice(2,8); }
function prettySize(n?: number){
  if(n===undefined) return ""; if(n<1024) return n+" B"; if(n<1024*1024) return (n/1024).toFixed(1)+" KB"; return (n/1024/1024).toFixed(1)+" MB";
}

// 背景/要求：样本列表（文本样本 + 文件样本卡片）
const bgSamples = ref<Sample[]>([{ id: uid(), kind:"text", text:"" }]);
const rqSamples = ref<Sample[]>([{ id: uid(), kind:"text", text:"" }]);

const bgVars = ref<KV[]>([]);
const rqVars = ref<KV[]>([]);
const styles = ref<StyleProfile[]>(listStyles());
const styleId = ref<string>(styles.value[0]?.id || "");
const lengthHint = ref<string>("");

const multi = ref<boolean>(true);
const segs = ref<Segment[]>(["标题","大纲","正文","行动号召"]);

const phaseBusy = ref<string| null>(null);
const err = ref<string|null>(null);

// 汇总隐藏文本（用于抽取/生成/存档）
const agg = (arr: Sample[]) => arr.map(s => s.text.trim()).filter(Boolean).join("\n\n---\n\n");
const bgAgg = computed(()=>agg(bgSamples.value));
const rqAgg = computed(()=>agg(rqSamples.value));

function addTextSample(target:"bg"|"rq"){
  (target==="bg"?bgSamples:rqSamples).value.push({ id: uid(), kind:"text", text:"" });
}
function removeSample(target:"bg"|"rq", i:number){
  (target==="bg"?bgSamples:rqSamples).value.splice(i,1);
}
async function addFileSample(target:"bg"|"rq", ev: Event){
  const file = (ev.target as HTMLInputElement).files?.[0]; if(!file) return;
  try{
    const text = await extractTextFromFile(file);
    (target==="bg"?bgSamples:rqSamples).value.push({ id: uid(), kind:"file", text, fileName:file.name, fileSize:file.size });
  }catch(e:any){ alert("解析失败："+(e?.message||String(e))+"，可先复制纯文本。"); }
  finally{ (ev.target as HTMLInputElement).value = ""; }
}
async function replaceWithFile(target:"bg"|"rq", i:number, ev: Event){
  const file = (ev.target as HTMLInputElement).files?.[0]; if(!file) return;
  try{
    const text = await extractTextFromFile(file);
    const arr = (target==="bg"?bgSamples:rqSamples).value;
    arr[i] = { id: arr[i].id, kind:"file", text, fileName:file.name, fileSize:file.size };
  }catch(e:any){ alert("解析失败："+(e?.message||String(e))+"，可先复制纯文本。"); }
  finally{ (ev.target as HTMLInputElement).value = ""; }
}

async function doExtract(target:"bg"|"rq"){
  err.value = null;
  if(!provider.value || !getKey()){ err.value = "请先在 Settings 配置 Provider / API Key"; return; }
  if(!model.value){ err.value = "请选择模型"; return; }
  const text = target==="bg" ? bgAgg.value : rqAgg.value;
  if(!text.trim()){ err.value = (target==="bg"?"背景":"要求")+"样本为空"; return; }
  phaseBusy.value = "extract-"+target;
  try{
    const arr = await extractVars(provider.value!, getApiBase(), getKey()!, model.value, text, target==="bg"?"背景":"要求");
    if(target==="bg") bgVars.value = arr; else rqVars.value = arr;
  }catch(e:any){ err.value = e?.message || String(e); }
  finally{ phaseBusy.value = null; }
}

const output = ref(""); const usage = ref<any|null>(null); const latency = ref<number|null>(null);
const segResults = ref<Record<string,string>>({}); const segLatency = ref<number|null>(null);

async function doGenerate(){
  err.value = null; output.value = ""; usage.value = null; latency.value = null; segResults.value = {}; segLatency.value = null;
  if(!provider.value || !getKey()){ err.value = "请先在 Settings 配置 Provider / API Key"; return; }
  if(!model.value){ err.value = "请选择模型"; return; }
  const s = styles.value.find(x=>x.id===styleId.value); if(!s){ err.value = "请选择风格"; return; }

  if (multi.value) {
    phaseBusy.value = "generate-multi";
    try{
      const r = await generateSegments(provider.value!, getApiBase(), getKey()!, model.value, bgVars.value, rqVars.value, s, segs.value, { lengthHint: lengthHint.value || undefined });
      segResults.value = r.results;
      segLatency.value = r.totalLatency;
      if (r.results["正文"]) { output.value = r.results["正文"]; }
      saveProjectSnapshot(r.results);
    }catch(e:any){ err.value = e?.message || String(e); }
    finally{ phaseBusy.value = null; }
  } else {
    phaseBusy.value = "generate-one";
    try{
      const r = await generateWithStyle(provider.value!, getApiBase(), getKey()!, model.value, bgVars.value, rqVars.value, s, { lengthHint: lengthHint.value || undefined });
      output.value = r.content; usage.value = r.usage; latency.value = r.latencyMs;
      saveProjectSnapshot({ 正文: r.content });
    }catch(e:any){ err.value = e?.message || String(e); }
    finally{ phaseBusy.value = null; }
  }
}

// 项目存档（把汇总文本写入 bgText/rqText，兼容旧版本）
function saveProjectSnapshot(outputs: Record<string,string>) {
  const p = upsertProject({
    id: currentPid.value || undefined,
    name: projectName.value || "未命名项目",
    bgText: bgAgg.value, rqText: rqAgg.value,
    bgVars: bgVars.value, rqVars: rqVars.value,
    styleId: styleId.value, lengthHint: lengthHint.value || undefined,
    outputs
  });
  currentPid.value = p.id;
}

function saveAsNew() { currentPid.value = null; saveProjectSnapshot({}); alert("已另存为新项目"); }
function updateCurrent() {
  saveProjectSnapshot(segResults.value && Object.keys(segResults.value).length ? segResults.value : (output.value ? { 正文: output.value } : {}));
  alert("项目已更新");
}
function openProjects() { router.push({ name: "projects" }); }

// 导出
function assembleMarkdown(): string {
  if (Object.keys(segResults.value).length) {
    let md = `# ${projectName.value || "未命名项目"}\n\n`;
    const order = ["标题","摘要","大纲","正文","行动号召"];
    for (const key of order) if (segResults.value[key]) md += `## ${key}\n\n${segResults.value[key]}\n\n`;
    return md;
  } else {
    return `# ${projectName.value || "未命名项目"}\n\n${output.value || ""}\n`;
  }
}
function exportAs(type: "md" | "docx" | "pdf") {
  const filename = (projectName.value || "project").replace(/[\\/:*?"<>|]/g, "_");
  if (type === "md") exportMarkdown(filename, assembleMarkdown());
  else if (type === "docx") {
    if (Object.keys(segResults.value).length) exportDocx({ filename, title: projectName.value || "未命名项目", segments: segResults.value });
    else exportDocx({ filename, title: projectName.value || "未命名项目", content: output.value || "" });
  } else exportPDFByElementId(filename, "export-area");
}
function exportCurrent() {
  if (!currentPid.value) { alert("尚未保存项目"); return; }
  const json = exportProjectJSON(currentPid.value);
  const blob = new Blob([json], { type: "application/json" }); const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = (projectName.value||"project") + ".json"; a.click(); URL.revokeObjectURL(url);
}
async function importFromFile(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return;
  const text = await file.text();
  const p = importProjectFromJSON(text);
  router.push({ name: "workspace", query: { pid: p.id } });
}

// 恢复项目（兼容旧版本）
onMounted(() => {
  const pid = (route.query.pid as string) || "";
  if (pid) {
    const p = getProject(pid);
    if (p) {
      currentPid.value = p.id;
      projectName.value = p.name;
      bgSamples.value = [{ id: uid(), kind:"text", text: p.bgText || "" }];
      rqSamples.value = [{ id: uid(), kind:"text", text: p.rqText || "" }];
      bgVars.value = p.bgVars || [];
      rqVars.value = p.rqVars || [];
      styleId.value = p.styleId || styleId.value;
      lengthHint.value = p.lengthHint || "";
      if (p.outputs) { segResults.value = p.outputs; output.value = p.outputs["正文"] || ""; }
    }
  }
});

const html = computed(()=>renderMarkdown(output.value));
function refreshStyles(){ styles.value = listStyles(); if(!styles.value.find(x=>x.id===styleId.value)) styleId.value = styles.value[0]?.id || ""; }
</script>

<template>
  <div class="p-8 max-w-6xl">
    <div class="flex items-center justify-between flex-wrap gap-2">
      <h2 class="text-xl font-semibold">工作区（项目生成）</h2>
      <div class="flex items-center gap-2 text-sm">
        <input v-model="projectName" class="border rounded p-2" placeholder="项目名称"/>
        <button class="px-3 py-2 border rounded" @click="saveAsNew">另存为新项目</button>
        <button class="px-3 py-2 border rounded" @click="updateCurrent">更新当前项目</button>
        <button class="px-3 py-2 border rounded" @click="openProjects">项目列表</button>
        <button class="px-3 py-2 border rounded" @click="exportCurrent">导出JSON</button>
        <label class="px-3 py-2 border rounded cursor-pointer">导入JSON<input type="file" class="hidden" accept="application/json" @change="importFromFile" /></label>
      </div>
    </div>

    <!-- ✅ 模型选择工具条（新增） -->
    <div class="mt-3 p-3 border rounded-lg bg-gray-50 flex items-center gap-3">
      <label class="text-sm font-medium">模型</label>
      <select v-model="model" class="border rounded p-2"
              :disabled="!provider || !modelList.length">
        <option v-for="m in modelList" :key="m.id" :value="m.id">{{ m.display }}</option>
      </select>
      <span class="text-xs text-gray-500">
        Provider：{{ provider || '未配置' }}
      </span>
    </div>

    <p class="text-sm text-gray-600 mt-3">导入 Word/PDF/TXT 仅显示“文件卡片”；文本样本可手动粘贴。抽取/生成时自动汇总隐藏文本。</p>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      <!-- 左列：背景/要求 + 变量 -->
      <div class="space-y-4">
        <!-- 背景 -->
        <div class="border rounded-xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="font-medium">背景素材</h3>
            <div class="flex items-center gap-3">
              <button class="text-xs underline" @click="addTextSample('bg')">添加文本样本</button>
              <label class="text-xs underline cursor-pointer">从文件添加<input type="file" class="hidden" accept=".txt,.docx,.pdf" @change="(e)=>addFileSample('bg',e)" /></label>
              <button class="text-xs underline" :disabled="phaseBusy" @click="doExtract('bg')">{{ phaseBusy==='extract-bg' ? '抽取中…' : '一键抽取变量' }}</button>
            </div>
          </div>
          <div class="space-y-2">
            <div v-for="(s,i) in bgSamples" :key="s.id" class="border rounded p-2 space-y-2">
              <div class="flex items-center justify-between text-xs text-gray-600">
                <div>样本 #{{ i+1 }} · {{ s.kind==='file' ? '文件' : '文本' }}</div>
                <div class="flex items-center gap-3">
                  <label class="underline cursor-pointer">用文件替换<input type="file" class="hidden" accept=".txt,.docx,.pdf" @change="(e)=>replaceWithFile('bg', i, e)" /></label>
                  <button v-if="bgSamples.length>1" class="text-red-600 underline" @click="removeSample('bg', i)">删除</button>
                </div>
              </div>
              <template v-if="s.kind==='file'">
                <div class="flex items-center justify-between bg-gray-50 rounded p-3">
                  <div class="text-sm">
                    <div>📄 {{ s.fileName }}</div>
                    <div class="text-xs text-gray-500">{{ prettySize(s.fileSize) }}</div>
                  </div>
                  <div class="text-xs text-gray-500">（内容已解析，用于抽取/生成，不在页面展开）</div>
                </div>
              </template>
              <template v-else>
                <textarea v-model="s.text" rows="4" class="w-full border rounded p-2" placeholder="粘贴纯文本样本"></textarea>
              </template>
            </div>
          </div>

          <div>
            <div class="flex items-center justify-between">
              <label class="text-sm">背景变量</label>
              <button class="text-xs underline" @click="bgVars.push({key:'new_key', value:''})">添加变量</button>
            </div>
            <div class="space-y-2 mt-2">
              <div v-for="(v,i) in bgVars" :key="i" class="grid grid-cols-5 gap-2">
                <input v-model="v.key" class="border rounded p-2 col-span-1" placeholder="key"/>
                <input v-model="v.label" class="border rounded p-2 col-span-1" placeholder="label(可选)"/>
                <textarea v-model="v.value" rows="2" class="border rounded p-2 col-span-3" placeholder="value"></textarea>
                <button class="text-xs text-red-600 underline col-span-5 text-left" @click="bgVars.splice(i,1)">删除</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 要求 -->
        <div class="border rounded-xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="font-medium">要求素材</h3>
            <div class="flex items-center gap-3">
              <button class="text-xs underline" @click="addTextSample('rq')">添加文本样本</button>
              <label class="text-xs underline cursor-pointer">从文件添加<input type="file" class="hidden" accept=".txt,.docx,.pdf" @change="(e)=>addFileSample('rq',e)" /></label>
              <button class="text-xs underline" :disabled="phaseBusy" @click="doExtract('rq')">{{ phaseBusy==='extract-rq' ? '抽取中…' : '一键抽取变量' }}</button>
            </div>
          </div>
          <div class="space-y-2">
            <div v-for="(s,i) in rqSamples" :key="s.id" class="border rounded p-2 space-y-2">
              <div class="flex items-center justify-between text-xs text-gray-600">
                <div>样本 #{{ i+1 }} · {{ s.kind==='file' ? '文件' : '文本' }}</div>
                <div class="flex items-center gap-3">
                  <label class="underline cursor-pointer">用文件替换<input type="file" class="hidden" accept=".txt,.docx,.pdf" @change="(e)=>replaceWithFile('rq', i, e)" /></label>
                  <button v-if="rqSamples.length>1" class="text-red-600 underline" @click="removeSample('rq', i)">删除</button>
                </div>
              </div>
              <template v-if="s.kind==='file'">
                <div class="flex items-center justify-between bg-gray-50 rounded p-3">
                  <div class="text-sm">
                    <div>📄 {{ s.fileName }}</div>
                    <div class="text-xs text-gray-500">{{ prettySize(s.fileSize) }}</div>
                  </div>
                  <div class="text-xs text-gray-500">（内容已解析，用于抽取/生成，不在页面展开）</div>
                </div>
              </template>
              <template v-else>
                <textarea v-model="s.text" rows="4" class="w-full border rounded p-2" placeholder="粘贴纯文本样本"></textarea>
              </template>
            </div>
          </div>

          <div>
            <div class="flex items-center justify-between">
              <label class="text-sm">要求变量</label>
              <button class="text-xs underline" @click="rqVars.push({key:'new_key', value:''})">添加变量</button>
            </div>
            <div class="space-y-2 mt-2">
              <div v-for="(v,i) in rqVars" :key="i" class="grid grid-cols-5 gap-2">
                <input v-model="v.key" class="border rounded p-2 col-span-1" placeholder="key"/>
                <input v-model="v.label" class="border rounded p-2 col-span-1" placeholder="label(可选)"/>
                <textarea v-model="v.value" rows="2" class="border rounded p-2 col-span-3" placeholder="value"></textarea>
                <button class="text-xs text-red-600 underline col-span-5 text-left" @click="rqVars.splice(i,1)">删除</button>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- 右列：风格选择、生成、导出、结果 -->
      <div class="space-y-4">
        <div class="border rounded-xl p-4">
          <label class="text-sm font-medium">选择风格</label>
          <select v-model="styleId" class="w-full border rounded p-2 mt-1">
            <option v-for="s in styles" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <div class="mt-2">
            <label class="text-xs text-gray-600">长度提示（可选，如：约300字/两段/要有小标题）</label>
            <input v-model="lengthHint" class="w-full border rounded p-2 mt-1"/>
          </div>

          <div class="mt-3 flex items-center gap-3 text-sm">
            <label class="flex items-center gap-2">
              <input type="checkbox" v-model="multi" />
              多段生成
            </label>
            <div v-if="multi" class="flex flex-wrap gap-3">
              <label class="flex items-center gap-1"><input type="checkbox" value="标题" v-model="segs" />标题</label>
              <label class="flex items-center gap-1"><input type="checkbox" value="摘要" v-model="segs" />摘要</label>
              <label class="flex items-center gap-1"><input type="checkbox" value="大纲" v-model="segs" />大纲</label>
              <label class="flex items-center gap-1"><input type="checkbox" value="正文" v-model="segs" />正文</label>
              <label class="flex items-center gap-1"><input type="checkbox" value="行动号召" v-model="segs" />行动号召</label>
            </div>
          </div>

          <div class="mt-3 flex items-center gap-3">
            <button class="px-4 py-2 rounded bg-black text-white" :disabled="phaseBusy?.startsWith('generate')" @click="doGenerate">
              {{ phaseBusy?.startsWith('generate') ? '生成中…' : '生成' }}
            </button>

            <div class="text-sm flex items-center gap-2">
              <button class="px-3 py-2 border rounded" @click="exportAs('md')">导出 MD</button>
              <button class="px-3 py-2 border rounded" @click="exportAs('docx')">导出 Word</button>
              <button class="px-3 py-2 border rounded" @click="exportAs('pdf')">导出 PDF</button>
            </div>

            <span v-if="err" class="text-sm text-red-600 ml-3">{{ err }}</span>
          </div>
        </div>

        <!-- 导出区域（PDF 会抓取这个容器） -->
        <div id="export-area" class="border rounded-xl p-4 min-h-[200px] bg-white">
          <template v-if="multi">
            <div v-if="Object.keys(segResults).length">
              <h3 class="text-lg font-semibold mb-2">{{ projectName || "未命名项目" }}</h3>
              <div class="space-y-4">
                <div v-for="(val,key) in segResults" :key="key">
                  <h4 class="font-medium mb-1">{{ key }}</h4>
                  <div class="prose max-w-none" v-html="renderMarkdown(val)"></div>
                </div>
              </div>
            </div>
            <p v-else class="text-gray-500 text-sm">多段结果会显示在这里（支持 Markdown）。</p>
          </template>
          <template v-else>
            <h3 class="text-lg font-semibold mb-2">{{ projectName || "未命名项目" }}</h3>
            <div v-if="output" v-html="renderMarkdown(output)"></div>
            <p v-else class="text-gray-500 text-sm">单段成文会显示在这里（支持 Markdown）。</p>
          </template>
        </div>

        <div class="text-xs text-gray-600">
          <div v-if="segLatency!==null">多段总耗时：{{ segLatency }} ms</div>
          <div v-else-if="latency!==null">耗时：{{ latency }} ms</div>
          <div v-if="usage">用量：prompt {{ usage?.prompt_tokens ?? 0 }} · completion {{ usage?.completion_tokens ?? 0 }} · total {{ usage?.total_tokens ?? 0 }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
