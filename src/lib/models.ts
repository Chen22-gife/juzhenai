export type Provider = "deepseek" | "openai";

export type ModelInfo = {
  id: string;
  display: string;
  provider: Provider;
  // 可选：按 1K token 的单价（自行填入你当前的真实价格；为 0 则不显示费用）
  price?: { promptPer1k?: number; completionPer1k?: number; currency?: string };
};

export const MODELS: ModelInfo[] = [
  { id: "deepseek-chat", display: "DeepSeek-Chat", provider: "deepseek", price: { promptPer1k: 0, completionPer1k: 0, currency: "USD" } },
  { id: "gpt-4o-mini",   display: "GPT-4o mini",   provider: "openai",  price: { promptPer1k: 0, completionPer1k: 0, currency: "USD" } },
];

export function modelsFor(p: Provider) {
  return MODELS.filter(m => m.provider === p);
}
export function findModel(id: string) {
  return MODELS.find(m => m.id === id) || null;
}
