import type { StyleProfile } from "./aiTextOps";

// 训练样本的持久化结构（与页面一致）
export type StyleSample = {
  id?: string;
  kind: "text" | "file";
  text: string;        // 内部使用的纯文本（文件样本解析后放这里）
  fileName?: string;   // kind=file 时显示
  fileSize?: number;   // kind=file 时显示
};

// 存到本地时：风格画像 + 可选样本列表
export type StoredStyle = StyleProfile & { samples?: StyleSample[] };

const KEY = "ms.styles.v1";

function loadAll(): StoredStyle[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function saveAll(list: StoredStyle[]) { localStorage.setItem(KEY, JSON.stringify(list)); }

export function listStyles(): StoredStyle[] { return loadAll(); }
export function getStyle(id: string): StoredStyle | null {
  return loadAll().find(s => s.id === id) ?? null;
}

// 新增或覆盖
export function upsertStyle(sp: StoredStyle) {
  const list = loadAll();
  const i = list.findIndex(x => x.id === sp.id);
  if (i >= 0) list[i] = sp; else list.unshift(sp);
  saveAll(list);
}

// 显式更新（编辑保存）
export function updateStyle(sp: StoredStyle) {
  const list = loadAll();
  const i = list.findIndex(x => x.id === sp.id);
  if (i >= 0) list[i] = sp; else list.unshift(sp); // 不存在则插入，避免丢失
  saveAll(list);
}

export function removeStyle(id: string) {
  saveAll(loadAll().filter(s => s.id !== id));
}
