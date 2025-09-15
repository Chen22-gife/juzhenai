import type { Provider } from "./byok";
import { chatComplete, estimateCost, type ChatMessage } from "./aiService";
import { renderTemplate, type WorkflowTemplate } from "./templates";

export async function runWorkflow(
  provider: Provider,
  baseUrl: string,
  apiKey: string,
  model: string,
  tpl: WorkflowTemplate,
  vars: Record<string,string>
) {
  const system = tpl.system ? renderTemplate(tpl.system, vars) : undefined;
  const user = renderTemplate(tpl.user, vars);
  const messages: ChatMessage[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: user });

  const res = await chatComplete(provider, baseUrl, apiKey, model, messages, { temperature: 0.7, max_tokens: 600 });
  return {
    content: res.content,
    usage: res.usage,
    latencyMs: res.latencyMs,
    cost: estimateCost(model, res.usage),
  };
}

/** 简易校验：必填变量不能空 */
export function validateVars(tpl: WorkflowTemplate, vars: Record<string,string>): string | null {
  for (const v of tpl.vars) {
    if (v.required && !vars[v.key]?.trim()) {
      return `「${v.label}」为必填`;
    }
  }
  return null;
}
