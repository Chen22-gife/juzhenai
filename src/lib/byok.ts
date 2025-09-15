const KEY = "ms.apiKey";
const PROVIDER = "ms.provider";
const API_BASE = "ms.apiBase";

export type Provider = "deepseek" | "openai";

export function setKey(k: string) { localStorage.setItem(KEY, k); }
export function getKey(): string | null { return localStorage.getItem(KEY); }
export function clearKey() { localStorage.removeItem(KEY); }

export function setProvider(p: Provider) { localStorage.setItem(PROVIDER, p); }
export function getProvider(): Provider | null { return (localStorage.getItem(PROVIDER) as Provider) ?? null; }

export function setApiBase(url: string) { localStorage.setItem(API_BASE, url); }
export function getApiBase(): string { return localStorage.getItem(API_BASE) ?? ""; }

export function maskKey(k: string) {
  if (!k) return "";
  const last4 = k.slice(-4);
  return `sk-************${last4}`;
}
