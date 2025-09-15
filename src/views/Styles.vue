<script setup lang="ts">
import { ref, computed } from "vue";
import { getProvider, getApiBase, getKey } from "../lib/byok";
import { modelsFor } from "../lib/models";
import { learnStyle, type StyleProfile } from "../lib/aiTextOps";
import { listStyles, upsertStyle, removeStyle, getStyle, updateStyle, type StoredStyle, type StyleSample } from "../lib/styleStore";
import { extractTextFromFile } from "../lib/docIngest";

function uid(){ return Math.random().toString(36).slice(2,8); }
function prettySize(n?: number){ if(n===undefined) return ""; if(n<1024) return n+" B"; if(n<1024*1024) return (n/1024).toFixed(1)+" KB"; return (n/1024/1024).toFixed(1)+" MB"; }

// 公共：Provider/模型
const provider = computed(() => getProvider());
const modelList = computed(() => provider.value ? modelsFor(provider.value) : []);
const modelLeft = ref<string>("");   // 左侧学习用模型
const modelRight = ref<string>("");  // 右侧重学用模型

// ================= 左侧：新风格学习 =================
const name = ref("");
const samples = ref<StyleSample[]>([{ id: uid(), kind:"text", text:"" }]);
const learning = ref(false);
const learned = ref<StyleProfile|null>(null);
const errLeft = ref<string|null>(null);

function addTextSample(){ samples.value.push({ id: uid(), kind:"text", text:"" }); }
function removeSample(i:number){ samples.value.splice(i,1); }
async function addSampleFromFile(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return;
  try { const text = await extractTextFromFile(file); samples.value.push({ id: uid(), kind:"file", text, fileName:file.name, fileSize:file.size }); }
  catch(e:any){ alert("解析失败："+(e?.message||String(e))); }
  finally { (ev.target as HTMLInputElement).value = ""; }
}
async function replaceWithFile(i:number, ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return;
  try { const text = await extractTextFromFile(file); samples.value[i] = { id: samples.value[i].id, kind:"file", text, fileName:file.name, fileSize:file.size }; }
  catch(e:any){ alert("解析失败："+(e?.message||String(e))); }
  finally { (ev.target as HTMLInputElement).value = ""; }
}

async function doLearn(){
  errLeft.value = null; learned.value = null;
  if(!provider.value || !getKey()){ errLeft.value = "请先在 Settings 配置 Provider / API Key"; return; }
  if(!modelLeft.value){ errLeft.value = "请选择模型"; return; }
  const validTexts = samples.value.map(s=>s.text.trim()).filter(Boolean);
  if(!name.value.trim() || !validTexts.length){ errLeft.value = "请填写风格名称，并至少添加一个样本（文本或文件）"; return; }
  learning.value = true;
  try{
    const sp = await learnStyle(provider.value, getApiBase(), getKey()!, modelLeft.value, name.value.trim(), validTexts);
    learned.value = sp;
  }catch(e:any){ errLeft.value = e?.message || String(e); }
  finally{ learning.value = false; }
}

function saveLearned(){
  if(!learned.value) return;
  const stored: StoredStyle = { ...(learned.value as StyleProfile), samples: samples.value.map(s=>({ ...s })) };
  upsertStyle(stored);
  all.value = listStyles();
  alert("已保存到风格库");
}

// ================= 右侧：编辑已保存风格（样本级）=================
const all = ref<StoredStyle[]>(listStyles());
const editingId = ref<string>("");
const editing = ref<StoredStyle | null>(null);
const errRight = ref<string|null>(null);

// 右侧样本编辑列表（与 editing.samples 同步）
const editSamples = ref<StyleSample[]>([]);

function loadEditing() {
  errRight.value = null;
  if (!editingId.value) { editing.value = null; editSamples.value = []; return; }
  const sp = getStyle(editingId.value) as StoredStyle | null;
  if (!sp) { editing.value = null; editSamples.value = []; return; }
  editing.value = JSON.parse(JSON.stringify(sp));
  // 旧数据可能没有 samples，则给一条空的文本样本作为起点
  editSamples.value = (sp.samples && sp.samples.length)
    ? sp.samples.map(s => ({ ...s, id: s.id || uid() }))
    : [{ id: uid(), kind:"text", text:"" }];
  // 默认把模型带过来（如果左侧刚选过，也可以直接选右侧独立模型）
  if (!modelRight.value && modelList.value.length) modelRight.value = modelList.value[0].id;
}

function addTextSampleEdit(){ editSamples.value.push({ id: uid(), kind:"text", text:"" }); }
function removeSampleEdit(i:number){ editSamples.value.splice(i,1); }
async function addFileSampleEdit(ev: Event){
  const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return;
  try { const text = await extractTextFromFile(file); editSamples.value.push({ id: uid(), kind:"file", text, fileName:file.name, fileSize:file.size }); }
  catch(e:any){ alert("解析失败："+(e?.message||String(e))); }
  finally { (ev.target as HTMLInputElement).value = ""; }
}
async function replaceWithFileEdit(i:number, ev: Event){
  const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return;
  try { const text = await extractTextFromFile(file); const s = editSamples.value[i]; editSamples.value[i] = { id: s.id, kind:"file", text, fileName:file.name, fileSize:file.size }; }
  catch(e:any){ alert("解析失败："+(e?.message||String(e))); }
  finally { (ev.target as HTMLInputElement).value = ""; }
}

// 重新学习并覆盖保存（保留同一个 id）
const retraining = ref(false);
async function relearnAndOverwrite(){
  errRight.value = null;
  if(!editing.value) return;
  if(!provider.value || !getKey()){ errRight.value = "请先在 Settings 配置 Provider / API Key"; return; }
  if(!modelRight.value){ errRight.value = "请选择模型"; return; }
  const texts = editSamples.value.map(s=>s.text.trim()).filter(Boolean);
  if(!editing.value.name.trim() || !texts.length){ errRight.value = "请填写风格名称，并至少添加一个样本"; return; }
  retraining.value = true;
  try{
    const fresh = await learnStyle(provider.value, getApiBase(), getKey()!, modelRight.value, editing.value.name.trim(), texts);
    // 用新的画像覆盖旧画像，但保留同 id，并把样本一起存
    const merged: StoredStyle = { ...(fresh as StyleProfile), id: editing.value.id, name: editing.value.name, samples: editSamples.value.map(s=>({ ...s })) };
    updateStyle(merged);
    all.value = listStyles();
    alert("已用新样本重新学习并覆盖保存");
  }catch(e:any){ errRight.value = e?.message || String(e); }
  finally{ retraining.value = false; }
}

// 重新学习并另存为新风格（新 id）
async function relearnAndSaveAsNew(){
  errRight.value = null;
  if(!editing.value) return;
  if(!provider.value || !getKey()){ errRight.value = "请先在 Settings 配置 Provider / API Key"; return; }
  if(!modelRight.value){ errRight.value = "请选择模型"; return; }
  const texts = editSamples.value.map(s=>s.text.trim()).filter(Boolean);
  if(!editing.value.name.trim() || !texts.length){ errRight.value = "请填写风格名称，并至少添加一个样本"; return; }
  retraining.value = true;
  try{
    const fresh = await learnStyle(provider.value, getApiBase(), getKey()!, modelRight.value, editing.value.name.trim(), texts);
    const stored: StoredStyle = { ...(fresh as StyleProfile), samples: editSamples.value.map(s=>({ ...s })) };
    upsertStyle(stored);
    all.value = listStyles();
    alert("已重新学习并另存为新风格");
  }catch(e:any){ errRight.value = e?.message || String(e); }
  finally{ retraining.value = false; }
}

function delStyle(id:string){
  if(!confirm("删除该风格？")) return;
  removeStyle(id);
  all.value = listStyles();
  if (editingId.value === id) { editingId.value = ""; editing.value = null; editSamples.value = []; }
}
</script>

<template>
  <div class="p-8 max-w-6xl">
    <h2 class="text-xl font-semibold">风格库</h2>
    <p class="text-sm text-gray-600 mt-1">左侧：从样本学习新风格；右侧：打开“已保存风格”，对其训练样本（文件/文本）增删改 → 重新学习并覆盖保存或另存。</p>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      <!-- ================= 左侧：新风格学习 ================= -->
      <div class="space-y-4">
        <div>
          <label class="text-sm font-medium">模型（用于左侧新学习）</label>
          <select v-model="modelLeft" class="w-full border rounded p-2 mt-1" :disabled="!provider || !modelList.length">
            <option v-for="m in modelList" :key="m.id" :value="m.id">{{ m.display }}</option>
          </select>
          <p class="text-xs text-gray-500 mt-1">Provider：{{ provider || '未配置' }}</p>
        </div>

        <div>
          <label class="text-sm font-medium">风格名称</label>
          <input v-model="name" class="w-full border rounded p-2 mt-1" placeholder="如：品牌短视频口语风"/>
        </div>

        <div>
          <div class="flex items-center justify-between">
            <label class="text-sm font-medium">样本列表</label>
            <div class="flex items-center gap-3">
              <button class="text-xs underline" @click="addTextSample">添加“文本样本”</button>
              <label class="text-xs underline cursor-pointer">从文件新建样本<input type="file" class="hidden" accept=".txt,.docx,.pdf" @change="addSampleFromFile" /></label>
            </div>
          </div>

          <div class="space-y-3 mt-2">
            <div v-for="(s,i) in samples" :key="s.id" class="space-y-2 border rounded p-3">
              <div class="flex items-center justify-between">
                <div class="text-xs text-gray-600">样本 #{{ i+1 }}</div>
                <div class="flex items-center gap-3">
                  <label class="text-xs underline cursor-pointer">用文件替换<input type="file" class="hidden" accept=".txt,.docx,.pdf" @change="(e)=>replaceWithFile(i, e)" /></label>
                  <button v-if="samples.length>1" class="text-xs text-red-600 underline" @click="removeSample(i)">删除</button>
                </div>
              </div>
              <template v-if="s.kind==='file'">
                <div class="flex items-center justify-between bg-gray-50 rounded p-3">
                  <div class="text-sm">
                    <div>📄 {{ s.fileName }}</div>
                    <div class="text-xs text-gray-500">{{ prettySize(s.fileSize) }}</div>
                  </div>
                  <div class="text-xs text-gray-500">（内容已解析，仅用于学习，不在页面展开）</div>
                </div>
              </template>
              <template v-else>
                <textarea v-model="s.text" rows="5" class="w-full border rounded p-2" placeholder="可粘贴纯文本样本"></textarea>
              </template>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <button :disabled="learning" class="px-4 py-2 rounded bg-black text-white disabled:opacity-60" @click="doLearn">
            {{ learning ? "学习中…" : "学习风格" }}
          </button>
          <span v-if="errLeft" class="text-sm text-red-600">{{ errLeft }}</span>
        </div>

        <div class="border rounded-xl p-4 min-h-[180px]">
          <template v-if="learned">
            <h3 class="font-medium mb-2">学习结果（风格画像）</h3>
            <pre class="text-xs whitespace-pre-wrap">{{ JSON.stringify(learned, null, 2) }}</pre>
            <button class="mt-3 px-3 py-2 border rounded" @click="saveLearned">保存到风格库</button>
          </template>
          <p v-else class="text-gray-500 text-sm">学习结果将显示在这里…</p>
        </div>
      </div>

      <!-- ================= 右侧：编辑已保存风格（样本级） ================= -->
      <div class="space-y-4">
        <div>
          <label class="text-sm font-medium">选择要编辑的风格</label>
          <select v-model="editingId" class="w-full border rounded p-2 mt-1" @change="loadEditing">
            <option value="">（请选择）</option>
            <option v-for="s in all" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <p class="text-xs text-gray-500 mt-1">当前风格数量：{{ all.length }}</p>
        </div>

        <div v-if="editing" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="text-sm font-medium">风格名称</label>
              <input v-model="editing.name" class="w-full border rounded p-2 mt-1"/>
            </div>
            <div>
              <label class="text-sm font-medium">模型（用于右侧重新学习）</label>
              <select v-model="modelRight" class="w-full border rounded p-2 mt-1" :disabled="!provider || !modelList.length">
                <option v-for="m in modelList" :key="m.id" :value="m.id">{{ m.display }}</option>
              </select>
            </div>
          </div>

          <div>
            <div class="flex items-center justify-between">
              <label class="text-sm font-medium">训练样本（可增删改）</label>
              <div class="flex items-center gap-3">
                <button class="text-xs underline" @click="addTextSampleEdit">添加“文本样本”</button>
                <label class="text-xs underline cursor-pointer">从文件添加样本<input type="file" class="hidden" accept=".txt,.docx,.pdf" @change="addFileSampleEdit" /></label>
              </div>
            </div>

            <div class="space-y-2 mt-2">
              <div v-for="(s,i) in editSamples" :key="s.id" class="border rounded p-2 space-y-2">
                <div class="flex items-center justify-between text-xs text-gray-600">
                  <div>样本 #{{ i+1 }} · {{ s.kind==='file' ? '文件' : '文本' }}</div>
                  <div class="flex items-center gap-3">
                    <label class="underline cursor-pointer">用文件替换<input type="file" class="hidden" accept=".txt,.docx,.pdf" @change="(e)=>replaceWithFileEdit(i, e)" /></label>
                    <button v-if="editSamples.length>1" class="text-red-600 underline" @click="removeSampleEdit(i)">删除</button>
                  </div>
                </div>
                <template v-if="s.kind==='file'">
                  <div class="flex items-center justify-between bg-gray-50 rounded p-3">
                    <div class="text-sm">
                      <div>📄 {{ s.fileName }}</div>
                      <div class="text-xs text-gray-500">{{ prettySize(s.fileSize) }}</div>
                    </div>
                    <div class="text-xs text-gray-500">（内容已解析，仅用于学习，不在页面展开）</div>
                  </div>
                </template>
                <template v-else>
                  <textarea v-model="s.text" rows="4" class="w-full border rounded p-2" placeholder="可粘贴纯文本样本"></textarea>
                </template>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <button :disabled="retraining" class="px-4 py-2 rounded bg-black text-white disabled:opacity-60" @click="relearnAndOverwrite">
              {{ retraining ? "重新学习中…" : "重新学习并覆盖保存" }}
            </button>
            <button :disabled="retraining" class="px-4 py-2 rounded border" @click="relearnAndSaveAsNew">重新学习并另存为新风格</button>
            <span v-if="errRight" class="text-sm text-red-600">{{ errRight }}</span>
          </div>

          <div>
            <h3 class="font-medium mt-4">删除风格</h3>
            <button class="mt-2 px-3 py-2 border rounded text-red-600" @click="delStyle(editing!.id)">删除该风格</button>
          </div>
        </div>

        <div class="mt-4">
          <h3 class="font-medium">我的风格库</h3>
          <div class="mt-2 space-y-2">
            <div v-if="!all.length" class="text-gray-500 text-sm">暂无风格。</div>
            <div v-for="s in all" :key="s.id" class="border rounded p-3 flex items-center justify-between">
              <div>
                <div class="font-medium">{{ s.name }}</div>
                <p class="text-xs text-gray-600 mt-1">{{ s.summary }}</p>
              </div>
              <div class="flex items-center gap-2">
                <button class="px-3 py-1 border rounded text-sm" @click="editingId=s.id; loadEditing()">打开编辑</button>
                <button class="px-3 py-1 border rounded text-sm text-red-600" @click="delStyle(s.id)">删除</button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>
