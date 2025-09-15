import type { Provider } from "./byok";
import { chatComplete, estimateCost } from "./aiService";

/** 连通性测试：最小请求，成功即 ok=true */
export async function testKey(
  provider: Provider,
  baseUrl: string,
  apiKey: string
): Promise<{ ok: boolean; message: string }> {
  const model = provider === "openai" ? "gpt-4o-mini" : "deepseek-chat";
  try {
    await chatComplete(
      provider,
      baseUrl,
      apiKey,
      model,
      [
        { role: "user", content: "ping" }
      ],
      { temperature: 0, max_tokens: 1 }
    );
    return { ok: true, message: "连接成功 ✅" };
  } catch (e: any) {
    return { ok: false, message: (e?.message || String(e)).slice(0, 300) };
  }
}

/** 生成短视频标题（严格返回 JSON 数组） */
export async function generateTitles(
  provider: Provider,
  baseUrl: string,
  apiKey: string,
  model: string,
  topic: string,
  n = 5
): Promise<{ titles: string[]; usage: any | null; latencyMs: number; cost: ReturnType<typeof estimateCost> }> {
  const system = "你是短视频标题优化助手。只输出 JSON 数组字符串，不要多余文本。";
  const user = `为以下主题生成${n}个中文短视频标题，抓住3秒注意力，15字以内，避免重复词，适配抖音/视频号：\n主题：${topic}\n输出格式示例：["标题1","标题2",...]\n只输出JSON数组！`;

  const res = await chatComplete(
    provider,
    baseUrl,
    apiKey,
    model,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.7, max_tokens: 256 }
  );

  let titles: string[] = [];
  try {
    titles = JSON.parse(res.content);
  } catch {
    const m = res.content.match(/\[.*\]/s);
    if (m) {
      try { titles = JSON.parse(m[0]); } catch {}
    }
  }
  if (!Array.isArray(titles)) throw new Error("解析失败：模型未按JSON数组返回");

  return {
    titles: titles.slice(0, n),
    usage: res.usage,
    latencyMs: res.latencyMs,
    cost: estimateCost(model, res.usage),
  };
}
