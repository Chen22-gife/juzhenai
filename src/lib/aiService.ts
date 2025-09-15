import type { Provider } from "./byok";
import { findModel } from "./models";
import { fetchJson } from "./aiRuntime";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function normalizeBase(provider: Provider, baseUrl: string) {
  if (!baseUrl) return provider === "openai" ? "https://api.openai.com" : "https://api.deepseek.com";
  return baseUrl.replace(/\/+$/, "");
}

export async function chatComplete(
  provider: Provider,
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  params?: { temperature?: number; max_tokens?: number }
): Promise<{ content: string; usage: any | null; latencyMs: number; model: string; provider: Provider; raw: any }> {
  const base = normalizeBase(provider, baseUrl);
  const endpoint = `${base}/v1/chat/completions`;
  const body = { model, messages, ...(params || {}) };

  const { data, text, response, durationMs } = await fetchJson(endpoint, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: 30_000,
    retryCfg: { retries: 2, baseDelayMs: 700, factor: 2 },
  });

  if (!response.ok) {
    // 这里直接透出模型/网关返回的错误片段，便于排查
    throw new Error(`HTTP ${response.status}: ${text?.slice(0, 600)}`);
  }

  const content = data?.choices?.[0]?.message?.content ?? "";
  const usage = data?.usage ?? null;
  return { content, usage, latencyMs: durationMs, model, provider, raw: data };
}

export function estimateCost(modelId: string, usage: any): { currency: string; promptCost: number; completionCost: number; total: number } | null {
  const m = findModel(modelId);
  if (!m || !m.price || !(usage?.prompt_tokens || usage?.completion_tokens)) return null;
  const p = m.price;
  const promptTokens = usage?.prompt_tokens || 0;
  const completionTokens = usage?.completion_tokens || 0;
  const promptCost = p.promptPer1k ? (promptTokens / 1000) * (p.promptPer1k || 0) : 0;
  const completionCost = p.completionPer1k ? (completionTokens / 1000) * (p.completionPer1k || 0) : 0;
  return { currency: p.currency || "USD", promptCost, completionCost, total: promptCost + completionCost };
}
