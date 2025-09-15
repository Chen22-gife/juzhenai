<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useAppStore } from "../stores/app";
import { setApiBase, setKey, setProvider, getKey, getApiBase, getProvider, clearKey, type Provider } from "../lib/byok";
import { testKey } from "../lib/aiClient";

const store = useAppStore();

const provider = ref<Provider>((getProvider() as Provider) || "deepseek");
const isLocal = typeof location !== "undefined" && (location.hostname === "localhost" || location.hostname === "127.0.0.1");
const useProxy = ref<boolean>(isLocal); // 本地默认开启代理
const apiBase = ref<string>("");        // 初始化在 onMounted 里处理
const apiKeyInput = ref<string>("");
const showKey = ref(false);
const testing = ref(false);
const testResult = ref<{ ok: boolean; message: string } | null>(null);

function computeBase(p: Provider, proxy: boolean) {
  if (proxy && isLocal) return p === "openai" ? "/api/openai" : "/api/deepseek";
  return p === "openai" ? "https://api.openai.com" : "https://api.deepseek.com";
}

onMounted(() => {
  store.loadFromLocal();
  // 优先用保存过的 Base；否则按当前勾选与 provider 推一个默认
  const saved = getApiBase();
  apiBase.value = saved || computeBase(provider.value, useProxy.value);
});

function onProviderChange() {
  apiBase.value = computeBase(provider.value, useProxy.value);
}

function onProxyToggle() {
  apiBase.value = computeBase(provider.value, useProxy.value);
}

async function saveAndTest() {
  testResult.value = null;

  setProvider(provider.value);
  setApiBase(apiBase.value);

  if (apiKeyInput.value.trim()) {
    setKey(apiKeyInput.value.trim());
    store.setMasked(apiKeyInput.value.trim());
    apiKeyInput.value = "";
  }

  const realKey = getKey();
  if (!realKey) {
    testResult.value = { ok: false, message: "未找到 API Key，请先输入并保存" };
    return;
  }

  testing.value = true;
  const r = await testKey(provider.value, apiBase.value, realKey);
  testing.value = false;
  testResult.value = r;
  store.loadFromLocal();
}

function clearStoredKey() {
  clearKey();
  store.apiKeyMasked = "";
}
</script>

<template>
  <div class="p-8 max-w-xl">
    <h2 class="text-xl font-semibold">Settings（BYOK）</h2>
    <p class="text-gray-600 text-sm mt-2">
      在浏览器中保存并使用你的 DeepSeek / OpenAI API Key。开发期建议勾选“代理”避免 CORS。
    </p>

    <div class="mt-6 space-y-5">
      <!-- Provider -->
      <div>
        <label class="block text-sm font-medium mb-1">Provider</label>
        <select v-model="provider" @change="onProviderChange" class="w-full border rounded-lg p-2">
          <option value="deepseek">DeepSeek</option>
          <option value="openai">OpenAI</option>
        </select>
      </div>

      <!-- Dev Proxy -->
      <div class="flex items-center gap-2">
        <input id="proxy" type="checkbox" v-model="useProxy" @change="onProxyToggle" :disabled="!isLocal" />
        <label for="proxy" class="text-sm">
          开发代理（避免 CORS）
          <span class="text-gray-500" v-if="isLocal">→ 使用 /api/{{ provider === 'openai' ? 'openai' : 'deepseek' }}</span>
          <span class="text-gray-400" v-else>（仅本地可用）</span>
        </label>
      </div>

      <!-- API Base -->
      <div>
        <label class="block text-sm font-medium mb-1">API Base URL</label>
        <input v-model="apiBase" class="w-full border rounded-lg p-2" />
        <p class="text-xs text-gray-500 mt-1">可改为你的自定义网关或代理。</p>
      </div>

      <!-- API Key -->
      <div>
        <label class="block text-sm font-medium mb-1">API Key</label>
        <div class="flex gap-2">
          <input :type="showKey ? 'text' : 'password'" v-model="apiKeyInput" placeholder="粘贴你的密钥（只在输入时保存在内存）" class="flex-1 border rounded-lg p-2" />
          <button type="button" class="px-3 py-2 border rounded-lg" @click="showKey = !showKey">{{ showKey ? '隐藏' : '显示' }}</button>
        </div>
        <p class="text-xs text-gray-500 mt-1">已保存：
          <b v-if="store.apiKeyMasked">{{ store.apiKeyMasked }}</b>
          <span v-else class="text-red-500">未配置</span>
        </p>
        <button v-if="store.apiKeyMasked" type="button" class="mt-2 text-xs text-red-600 underline" @click="clearStoredKey">清除已保存的 Key</button>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-3">
        <button :disabled="testing" @click="saveAndTest" class="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-60">
          {{ testing ? '测试中…' : '保存并测试' }}
        </button>
        <span
          v-if="testResult"
          :class="{
            'text-green-600': testResult.ok,
            'text-red-600': !testResult.ok
          }"
        >
          {{ testResult.message }}
        </span>
      </div>
    </div>
  </div>
</template>
