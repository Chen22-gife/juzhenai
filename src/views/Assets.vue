<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { addImage, addVideo, listAssets, deleteAsset, blobUrl, type AssetItem, getBlob, updateAsset } from "../lib/assetsStore";
import { signUpload, putToSignedUrl } from "../lib/cloud";

const items = ref<AssetItem[]>(listAssets());
const busy = ref(false);
const error = ref<string | null>(null);

function refresh() { items.value = listAssets(); }

async function handleFiles(files: FileList | File[]) {
  error.value = null;
  const arr = Array.from(files);
  if (!arr.length) return;
  busy.value = true;
  try {
    for (const f of arr) {
      const t = (f.type || "").toLowerCase();
      if (t.startsWith("image/")) {
        await addImage(f);
      } else if (t.startsWith("video/")) {
        await addVideo(f);
      } else {
        error.value = "仅支持图片或视频文件";
      }
    }
    refresh();
  } catch (e: any) {
    error.value = e?.message || String(e);
  } finally {
    busy.value = false;
  }
}

function onDrop(ev: DragEvent) { ev.preventDefault(); if (ev.dataTransfer?.files?.length) handleFiles(ev.dataTransfer.files); }
function onDragOver(ev: DragEvent) { ev.preventDefault(); }

function onPaste(ev: ClipboardEvent) {
  const files: File[] = [];
  if (ev.clipboardData) {
    for (const item of ev.clipboardData.items) if (item.kind === "file") { const f = item.getAsFile(); if (f) files.push(f); }
  }
  if (files.length) handleFiles(files);
}
onMounted(() => document.addEventListener("paste", onPaste));
onBeforeUnmount(() => document.removeEventListener("paste", onPaste));

async function copyUrl(key: string) {
  try {
    const url = await blobUrl(key);
    await navigator.clipboard.writeText(url);
    alert("已复制临时链接（仅当前会话有效）：\n" + url);
  } catch (e: any) { alert("复制失败：" + (e?.message || String(e))); }
}
async function removeItem(id: string) { if (!confirm("确定删除该素材？")) return; await deleteAsset(id); refresh(); }

function prettySize(n: number) {
  if (n < 1024) return n + " B";
  if (n < 1024*1024) return (n/1024).toFixed(1) + " KB";
  return (n/1024/1024).toFixed(1) + " MB";
}
function fmtDuration(s?: number) { if (!s || !isFinite(s)) return ""; const m = Math.floor(s / 60); const ss = Math.round(s % 60); return `${m}:${ss.toString().padStart(2,"0")}`; }

const inputRef = ref<HTMLInputElement | null>(null);
function openPicker() { inputRef.value?.click(); }
function onPick(ev: Event) { const input = ev.target as HTMLInputElement; if (input.files?.length) handleFiles(input.files); input.value = ""; }

// === 新增：上传到云 ===
const uploadingId = ref<string | null>(null);

function extFromMime(mime: string) {
  const map: Record<string,string> = { "image/jpeg":"jpg","image/png":"png","image/webp":"webp","video/mp4":"mp4","video/webm":"webm" };
  return map[mime] || mime.split("/").pop() || "bin";
}

async function uploadOne(kind: "orig"|"preview"|"thumb", key: string, mime: string) {
  const blob = await getBlob(key); if (!blob) throw new Error("本地数据不存在");
  const sign = await signUpload({ kind, ext: extFromMime(mime), mime, size: blob.size, prefix: "uploads" });
  await putToSignedUrl(sign.putUrl, blob, mime);
  return sign.publicUrl;
}

async function uploadToCloud(it: AssetItem) {
  try {
    uploadingId.value = it.id;
    // 原文件
    const origUrl = await uploadOne("orig", it.origKey, it.mime);
    // 预览/封面
    let previewUrl: string | undefined = undefined;
    let thumbUrl: string | undefined = undefined;
    if (it.previewKey) previewUrl = await uploadOne("preview", it.previewKey, "image/jpeg");
    if (it.thumbKey)   thumbUrl   = await uploadOne("thumb", it.thumbKey, "image/jpeg");
    updateAsset({ id: it.id, cloudOrigUrl: origUrl, cloudPreviewUrl: previewUrl, cloudThumbUrl: thumbUrl });
    refresh();
    alert("上传完成 ✅");
  } catch (e: any) {
    alert("上传失败：" + (e?.message || String(e)));
  } finally {
    uploadingId.value = null;
  }
}
</script>

<template>
  <div class="p-8 max-w-6xl">
    <h2 class="text-xl font-semibold">Assets 素材中心（本地 + 云）</h2>
    <p class="text-sm text-gray-600 mt-2">
      支持 <b>拖拽</b> / <b>粘贴</b> / <b>选择</b> 上传图片或视频。图片会生成压缩图，视频会截取首帧封面。<br/>
      可一键“上传到云”（S3 兼容存储），返回长期可访问的 CDN URL。
    </p>

    <div class="mt-4 border-2 border-dashed rounded-xl p-10 text-center bg-gray-50" @drop="onDrop" @dragover="onDragOver">
      <div class="space-y-2">
        <div class="text-gray-700">拖拽文件到此处，或</div>
        <div class="flex justify-center gap-3">
          <button class="px-4 py-2 rounded bg-black text-white" @click="openPicker" :disabled="busy">选择文件</button>
          <input ref="inputRef" type="file" class="hidden" multiple accept="image/*,video/*" @change="onPick" />
          <span class="text-xs text-gray-500 self-center">也可直接粘贴 Ctrl+V</span>
        </div>
        <div v-if="busy" class="text-sm text-gray-600">处理中…</div>
        <div v-if="error" class="text-sm text-red-600">{{ error }}</div>
      </div>
    </div>

    <div class="mt-6">
      <div class="flex items-center justify-between mb-2">
        <h3 class="font-medium">素材列表（{{ items.length }}）</h3>
        <button class="text-sm underline" @click="refresh">刷新</button>
      </div>

      <div v-if="!items.length" class="text-gray-500 text-sm">暂无素材，试试拖拽或粘贴上传。</div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="it in items" :key="it.id" class="border rounded-xl p-3">
          <div class="aspect-video bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
            <template v-if="it.thumbDataUrl"><img :src="it.thumbDataUrl" class="w-full h-full object-cover" /></template>
            <template v-else><div class="text-xs text-gray-400">无缩略图</div></template>
          </div>

          <div class="mt-2 text-sm">
            <div class="font-medium truncate" :title="it.name">{{ it.name }}</div>
            <div class="text-gray-500 text-xs">{{ it.kind }} · {{ it.mime || 'N/A' }} · {{ prettySize(it.size) }}</div>
            <div class="text-gray-500 text-xs" v-if="it.width && it.height">{{ it.width }} × {{ it.height }} <span v-if="it.duration">· {{ fmtDuration(it.duration) }}</span></div>

            <div class="mt-2 flex flex-wrap gap-2">
              <button class="px-2 py-1 text-xs border rounded" @click="copyUrl(it.origKey)">复制原文件URL</button>
              <button v-if="it.previewKey" class="px-2 py-1 text-xs border rounded" @click="copyUrl(it.previewKey!)">复制压缩图URL</button>
              <button v-if="it.thumbKey" class="px-2 py-1 text-xs border rounded" @click="copyUrl(it.thumbKey!)">复制封面URL</button>
              <button class="px-2 py-1 text-xs border rounded text-red-600" @click="removeItem(it.id)">删除</button>
            </div>

            <div class="mt-2 flex flex-wrap gap-2 items-center">
              <button class="px-2 py-1 text-xs border rounded" :disabled="uploadingId===it.id" @click="uploadToCloud(it)">
                {{ uploadingId===it.id ? "上传中…" : "上传到云" }}
              </button>
              <span v-if="it.cloudOrigUrl" class="text-[10px] text-green-700 break-all">原：{{ it.cloudOrigUrl }}</span>
              <span v-if="it.cloudPreviewUrl" class="text-[10px] text-green-700 break-all">预：{{ it.cloudPreviewUrl }}</span>
              <span v-if="it.cloudThumbUrl" class="text-[10px] text-green-700 break-all">封：{{ it.cloudThumbUrl }}</span>
            </div>
          </div>
        </div>
      </div>

      <p class="text-xs text-gray-500 mt-3">
        提示：本地 <code>blob:</code> 链接仅当前会话有效；“上传到云”后的 URL 为长期可访问的 CDN 地址（由你在后端配置的 <code>CDN_BASE</code> 决定）。
      </p>
    </div>
  </div>
</template>
