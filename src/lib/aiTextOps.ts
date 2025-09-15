import { chatComplete } from "./aiService";
import type { Provider } from "./byok";

export type StyleProfile = {
  id: string;
  name: string;
  summary: string;
  audience?: string[];
  tone?: string[];
  sentenceLength?: "短句" | "中等" | "长句";
  structure?: string[];
  do?: string[];
  dont?: string[];
  examples?: string[];
};

export type KV = { key: string; label?: string; value: string };

function safeParseJSON(s: string) {
  try { return JSON.parse(s); } catch {
    const m = s.match(/\{[\s\S]*\}|\[[\s\S]*\]/); if (m) { try { return JSON.parse(m[0]); } catch {} }
    return null;
  }
}

// === 已有：学习风格 ===
export async function learnStyle(provider: Provider, base: string, apiKey: string, model: string, name: string, samples: string[]): Promise<StyleProfile> {
  const sys = "你是写作风格分析器。任务：从示例里抽取风格画像，只输出 JSON。";
  const user = `请基于以下样本文本，生成一个写作风格画像（字段固定且中文）：
字段：{
  "id": "由助手生成的短id",
  "name": "风格名称",
  "summary": "一句话总结",
  "audience": ["目标受众1","目标受众2"],
  "tone": ["轻松","专业","有温度"...],
  "sentenceLength": "短句|中等|长句",
  "structure": ["结构点1","结构点2"],
  "do": ["建议1","建议2"],
  "dont": ["避免1","避免2"],
  "examples": ["句式1","句式2"]
}
注意：只输出 JSON。
风格名称：${name}
样本（--- 分隔）：
---
${samples.join("\n---\n")}
`;
  const res = await chatComplete(provider, base, apiKey, model, [{ role:"system", content:sys },{ role:"user", content:user }], { temperature: 0.2, max_tokens: 800 });
  const data = safeParseJSON(res.content);
  if (!data || !data.name) throw new Error("风格学习失败：模型未返回合法 JSON");
  if (!data.id) data.id = Math.random().toString(36).slice(2,7);
  return data as StyleProfile;
}

// === 已有：变量抽取 ===
export async function extractVars(provider: Provider, base: string, apiKey: string, model: string, text: string, kind: "背景" | "要求"): Promise<KV[]> {
  const sys = "你是信息抽取助手。任务：把文本中的关键信息转换成可编辑的变量列表。只输出 JSON 数组。";
  const user = `请从以下【${kind}素材】中抽取尽可能完整的“变量”：
输出严格为 JSON 数组，每项形如：{"key":"标识符","label":"显示名(可选)","value":"字符串值"}
规则：
- key 简短有意义（brand, audience, pain_points, target_length...）
- 不确定也可给初步猜测，value 标注“(待确认)”
- 只输出 JSON 数组
素材：
${text}`;
  const res = await chatComplete(provider, base, apiKey, model, [{ role:"system", content:sys },{ role:"user", content:user }], { temperature: 0, max_tokens: 1200 });
  const data = safeParseJSON(res.content);
  if (!Array.isArray(data)) throw new Error("变量抽取失败：模型未返回 JSON 数组");
  return data as KV[];
}

// === 已有：单段成文 ===
export async function generateWithStyle(provider: Provider, base: string, apiKey: string, model: string, background: KV[], requirements: KV[], style: StyleProfile, options?: { lengthHint?: string }) {
  const sys = `你是一名高级写作者，严格遵循给定“风格画像”。要求：逻辑清晰、句式多样，遵循 do/dont。只输出最终成文。`;
  const fmt = (arr: KV[]) => arr.map(x => `- ${x.key}${x.label?`(${x.label})`:""}：${x.value}`).join("\n");
  const user = `【背景变量】：
${fmt(background)}

【要求变量】：
${fmt(requirements)}

【风格画像】（JSON）：
${JSON.stringify(style, null, 2)}

${options?.lengthHint ? `【长度提示】：${options.lengthHint}` : ""}

请直接输出成文。`;
  const res = await chatComplete(provider, base, apiKey, model, [{ role:"system", content:sys },{ role:"user", content:user }], { temperature: 0.7, max_tokens: 1200 });
  return { content: res.content, usage: res.usage, latencyMs: res.latencyMs };
}

// === 新增：多段生成 ===
export type Segment = "标题" | "摘要" | "大纲" | "正文" | "行动号召";

function segPrompt(seg: Segment, style: StyleProfile, background: KV[], requirements: KV[], lengthHint?: string) {
  const fmt = (arr: KV[]) => arr.map(x => `- ${x.key}${x.label?`(${x.label})`:""}：${x.value}`).join("\n");
  const common = `【背景变量】\n${fmt(background)}\n\n【要求变量】\n${fmt(requirements)}\n\n【风格画像】\n${JSON.stringify(style)}`;
  switch (seg) {
    case "标题":
      return `${common}\n\n任务：生成 5 个不同角度的标题（不编号）。要求简洁、有钩子，符合风格；只输出标题列表。`;
    case "摘要":
      return `${common}\n\n任务：生成 2 段摘要，每段 40~80 字，信息密度高，符合风格；只输出正文。`;
    case "大纲":
      return `${common}\n\n任务：输出一份分级大纲（1-2级小标题即可），结构合理、可直接用于写作；使用 Markdown 列表。`;
    case "正文":
      return `${common}\n\n任务：按大纲思路写出完整正文。${lengthHint?`长度提示：${lengthHint}`:""} 只输出正文。`;
    case "行动号召":
      return `${common}\n\n任务：给出 3 种不同风格的 CTA（行动号召），适合文末使用；只输出 CTA 列表。`;
  }
}

export async function generateSegments(
  provider: Provider, base: string, apiKey: string, model: string,
  background: KV[], requirements: KV[], style: StyleProfile,
  segments: Segment[], options?: { lengthHint?: string }
): Promise<{ results: Record<string,string>; totalLatency: number; usages: any[] }> {
  const results: Record<string,string> = {};
  const usages: any[] = [];
  let totalLatency = 0;
  for (const seg of segments) {
    const sys = "严格按用户提示完成任务；只输出指定内容，不要自我解释。";
    const user = segPrompt(seg, style, background, requirements, options?.lengthHint);
    const res = await chatComplete(provider, base, apiKey, model, [{ role:"system", content:sys },{ role:"user", content:user }], { temperature: seg==="正文"?0.7:0.5, max_tokens: seg==="正文"?1400:600 });
    results[seg] = res.content;
    usages.push(res.usage);
    totalLatency += res.latencyMs ?? 0;
  }
  return { results, totalLatency, usages };
}
