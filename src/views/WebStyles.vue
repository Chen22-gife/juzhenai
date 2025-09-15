<script setup lang="ts">
import { ref, computed } from "vue";
import { getKey, getProvider, getApiBase, type Provider } from "../lib/byok";
import { modelsFor } from "../lib/models";
import { learnStyle, type StyleProfile } from "../lib/aiTextOps";
import { upsertStyle, type StoredStyle, type StyleSample } from "../lib/styleStore";
import { grabYoutubeTranscript, asrTranscript } from "../lib/subtitle";

function uid(){ return Math.random().toString(36).slice(2,8); }

const globalProvider = computed(()=>getProvider());
const openaiAvailable = computed(()=>globalProvider.value === "openai" && !!getKey());

// ====== ASR 设置（仅非 YouTube 或抓取失败时使用；目前仅 OpenAI 支持）======
const modelForASR = ref<string>("gpt-4o-mini-transcribe"); // 可改 whisper-1

// ====== 学习风格的 Provider/模型（可选择 + 临时 Base/Key）======
const learnProvider = ref<Provider>(globalProvider.value || "deepseek");
const useCustomAuth = ref(false);
const customBase = ref("");
const customKey = ref("");

const modelForLearn = ref<string>("");
const modelList = computed(()=>modelsFor(learnProvider.value));

function resolveBase(p: Provider, custom: boolean, baseInput: string) {
  if (custom && baseInput.trim()) return baseInput.trim();
  return p === "openai" ? "https://api.openai.com" : "https://api.deepseek.com";
}
function resolveKey(custom: boolean, keyInput: string) {
  if (custom && keyInput.trim()) return keyInput.trim();
  return getKey(); // 复用 Settings 里的 Key（可能与所选 Provider 不同，如不同请勾选临时 Key）
}

// ====== 来源样本（由链接→字幕文本）======
type StyleSampleWithMeta = StyleSample & {
  platform?: "youtube"|"bilibili"|"douyin"|"instagram"|"tiktok"|"other";
  sourceUrl?: string;
  title?: string;
  preview?: string;
};

const name = ref("");
const urlInput = ref("");
const adding = ref(false);
const err = ref<string|null>(null);
const samples = ref<StyleSampleWithMeta[]>([]);

function detectPlatform(url:string){
  try{
    const u = new URL(url); const h = u.hostname.replace(/^www\./,"");
    if (h.includes("youtube.com") || h.includes("youtu.be")) return "youtube";
    if (h.includes("bilibili.com")) return "bilibili";
    if (h.includes("douyin.com") || h.includes("iesdouyin.com")) return "douyin";
    if (h.includes("instagram.com")) return "instagram";
    if (h.includes("tiktok.com")) return "tiktok";
    return "other";
  }catch{return "other";}
}

async function addFromUrl(){
  err.value = null;
  const url = urlInput.value.trim();
  if (!url) { err.value = "请粘贴视频网页链接"; return; }
  adding.value = true;
  try{
    const platform = detectPlatform(url);
    let text = "";
    // 1) YouTube 免 Key 抓字幕
    if (platform === "youtube") {
      try { const r = await grabYoutubeTranscript(url); text = r.text; } catch {}
    }
    // 2) 抓不到 → ASR（需 Settings 里选择 OpenAI 并配置 Key）
    if (!text) {
      if (!openaiAvailable.value) throw new Error("该站点需转写，请在 Settings 选择 OpenAI 并配置 API Key");
      const r = await asrTranscript(url, "openai", getKey()!, modelForASR.value);
      text = r.text;
    }
    const preview = text.slice(0, 100).replace(/\s+/g, " ");
    samples.value.push({
      id: uid(), kind: "file", text, fileName: url, fileSize: text.length,
      platform, sourceUrl: url, title: "", preview
    });
    urlInput.value = "";
  }catch(e:any){
    err.value = e?.message || String(e);
  }finally{
    adding.value = false;
  }
}
function removeSample(i:number){ samples.value.splice(i,1); }

// ====== 学习/保存 ======
const learning = ref(false);
const learned = ref<StyleProfile|null>(null);

async function doLearn(){
  err.value = null; learned.value = null;
  if (!modelForLearn.value){ err.value = "请选择“学习风格”的模型"; return; }
  const texts = samples.value.map(s=>s.text.trim()).filter(Boolean);
  if (!name.value.trim() || !texts.length){ err.value = "请填写风格名称并至少添加一个来源"; return; }

  // 解析 Base/Key
  const base = resolveBase(learnProvider.value, useCustomAuth.value, customBase.value);
  const key = resolveKey(useCustomAuth.value, customKey.value);
  if (!key) { err.value = "未找到可用的 API Key（可在此处填写临时 Key 或去 Settings 配置）"; return; }

  learning.value = true;
  try{
    const sp = await learnStyle(learnProvider.value, base, key, modelForLearn.value, name.value.trim(), texts);
    learned.value = sp;
  }catch(e:any){ err.value = e?.message || String(e); }
  finally{ learning.value = false; }
}

function saveLearned(){
  if (!learned.value) return;
  const stored: StoredStyle = {
    ...(learned.value as StyleProfile),
    origin: "web",
    samples: samples.value.map(s=>({
      id: s.id, kind: s.kind, text: s.text, fileName: s.fileName, fileSize: s.fileSize,
      platform: s.platform, sourceUrl: s.sourceUrl, title: s.title
    }))
  };
  upsertStyle(stored);
  alert("网页风格已保存（共用风格库），可在工作区直接使用");
}
</script>

<template>
  <div class="p-8 max-w-6xl">
    <h2 class="text-xl font-semibold">网页风格库（从视频网页自动生成字幕并学习风格）</h2>
    <p class="text-sm text-gray-600 mt-1">
      粘贴视频链接（YouTube 优先抓字幕，其他站点自动语音转写需 OpenAI Key）→ 生成字幕 → 用多条字幕样本学习为“风格”并保存。
    </p>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      <!-- 左侧：添加来源 & 样本列表 -->
      <div class="space-y-4">
        <div class="border rounded-xl p-4 space-y-3">
          <div>
            <label class="text-sm font-medium">视频网页链接</label>
            <div class="flex gap-2 mt-1">
              <input v-model="urlInput" class="border rounded p-2 flex-1" placeholder="粘贴 YouTube / 哔哩哔哩 / 抖音 / Instagram / TikTok 链接" />
              <button class="px-3 py-2 rounded bg-black text-white" :disabled="adding" @click="addFromUrl">
                {{ adding ? "获取字幕中…" : "添加为样本" }}
              </button>
            </div>
            <p class="text-xs text-gray-500 mt-1">
              YouTube 优先抓字幕（免 Key）；其他站点需“转写” → 请在 Settings 选择 OpenAI 并配置 Key。
            </p>
            <p v-if="err" class="text-xs text-red-600 mt-1">{{ err }}</p>
          </div>

          <div>
            <label class="text-sm font-medium">已添加样本（{{ samples.length }}）</label>
            <div class="space-y-2 mt-2">
              <div v-for="(s,i) in samples" :key="s.id" class="border rounded p-3">
                <div class="flex items-center justify-between">
                  <div class="text-sm">
                    <div>🌐 {{ s.platform || "other" }} · <a class="underline" :href="s.sourceUrl" target="_blank">打开原链接</a></div>
                    <div class="text-xs text-gray-500 mt-1">片段：{{ s.preview || "（无预览）" }}</div>
                  </div>
                  <button class="text-xs text-red-600 underline" @click="removeSample(i)">移除</button>
                </div>
              </div>
              <p v-if="!samples.length" class="text-xs text-gray-500">尚未添加任何来源。</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：选择 Provider/模型 学习 + 保存 -->
      <div class="space-y-4">
        <div class="border rounded-xl p-4 space-y-3">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="text-sm font-medium">学习 Provider</label>
              <select v-model="learnProvider" class="w-full border rounded p-2 mt-1">
                <option value="deepseek">DeepSeek</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>
            <div>
              <label class="text-sm font-medium">学习模型</label>
              <select v-model="modelForLearn" class="w-full border rounded p-2 mt-1" :disabled="!modelList.length">
                <option v-for="m in modelList" :key="m.id" :value="m.id">{{ m.display }}</option>
              </select>
            </div>
          </div>

          <div class="text-xs text-gray-600">
            <label class="inline-flex items-center gap-2 mt-1">
              <input type="checkbox" v-model="useCustomAuth" /> 使用临时 API Base / Key（不改全局 Settings）
            </label>
            <div v-if="useCustomAuth" class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
              <input v-model="customBase" class="border rounded p-2" placeholder="API Base，如 https://api.openai.com 或 https://api.deepseek.com" />
              <input v-model="customKey" class="border rounded p-2" placeholder="临时 API Key（只在本次使用）" />
            </div>
          </div>

          <div>
            <label class="text-sm font-medium">风格名称</label>
            <input v-model="name" class="w-full border rounded p-2 mt-1" placeholder="如：XX 账号口播风"/>
          </div>

          <div class="flex items-center gap-3">
            <button :disabled="learning" class="px-4 py-2 rounded bg-black text-white disabled:opacity-60" @click="doLearn">
              {{ learning ? "学习中…" : "学习风格" }}
            </button>
            <button class="px-4 py-2 rounded border" :disabled="!learned" @click="saveLearned">保存为风格</button>
          </div>

          <div class="border rounded p-3 min-h-[160px]">
            <template v-if="learned">
              <h3 class="font-medium mb-2">风格画像（预览）</h3>
              <pre class="text-xs whitespace-pre-wrap">{{ JSON.stringify(learned, null, 2) }}</pre>
            </template>
            <p v-else class="text-xs text-gray-500">学习结果会显示在这里。</p>
          </div>
        </div>

        <div class="border rounded-xl p-4 space-y-2">
          <h3 class="font-medium">ASR 转写设置（非 YouTube 场景）</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="text-sm">ASR 模型（OpenAI）</label>
              <input v-model="modelForASR" class="w-full border rounded p-2 mt-1" placeholder="gpt-4o-mini-transcribe 或 whisper-1"/>
            </div>
            <div class="text-xs text-gray-500 flex items-end">抓字幕失败或非 YouTube 时使用；需要在 Settings 选择 OpenAI 并配置 Key。</div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>
