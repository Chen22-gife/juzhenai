import { defineStore } from "pinia";
import { getApiBase, getProvider, getKey, maskKey, type Provider } from "../lib/byok";

export const useAppStore = defineStore("app", {
  state: () => ({
    provider: null as Provider | null,
    apiBase: "" as string,
    apiKeyMasked: "" as string,
  }),
  actions: {
    loadFromLocal() {
      const p = getProvider();
      const b = getApiBase();
      const k = getKey();
      this.provider = p;
      this.apiBase = b || "";
      this.apiKeyMasked = k ? maskKey(k) : "";
    },
    setMasked(k: string) {
      this.apiKeyMasked = k ? maskKey(k) : "";
    },
  },
});
