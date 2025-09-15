import { BUILTIN_TEMPLATES, type WorkflowTemplate, type WorkflowPack } from "./templates";

const STORAGE = "ms.templates.v1";

/** 读取用户模板（仅自定义部分） */
export function loadUserTemplates(): WorkflowTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return [];
    const pack = JSON.parse(raw) as WorkflowPack | WorkflowTemplate[];
    if (Array.isArray(pack)) return pack as WorkflowTemplate[];
    if (pack && pack.version === "1.0" && Array.isArray(pack.templates)) return pack.templates;
    return [];
  } catch { return []; }
}

/** 保存用户模板（仅自定义部分） */
export function saveUserTemplates(list: WorkflowTemplate[]) {
  const pack: WorkflowPack = { version: "1.0", templates: list };
  localStorage.setItem(STORAGE, JSON.stringify(pack));
}

/** 合并后的模板库（内置 + 自定义，自定义按 id 覆盖内置） */
export function listAllTemplates(): WorkflowTemplate[] {
  const user = loadUserTemplates();
  const map = new Map<string, WorkflowTemplate>(BUILTIN_TEMPLATES.map(t => [t.id, t]));
  for (const t of user) map.set(t.id, t);
  return Array.from(map.values());
}

export function upsertTemplate(t: WorkflowTemplate) {
  const user = loadUserTemplates();
  const idx = user.findIndex(x => x.id === t.id);
  if (idx >= 0) user[idx] = t; else user.push(t);
  saveUserTemplates(user);
}

export function removeTemplate(id: string) {
  const user = loadUserTemplates().filter(x => x.id !== id);
  saveUserTemplates(user);
}
