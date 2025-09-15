import type { KV, StyleProfile } from "./aiTextOps";

export type Project = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  // 工作区快照
  bgText: string;
  rqText: string;
  bgVars: KV[];
  rqVars: KV[];
  styleId: string;
  lengthHint?: string;
  // 结果（单段或多段）
  outputs?: Record<string, string>;
  usage?: any;
  latencyMs?: number;
};

const KEY = "ms.projects.v1";

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

export function listProjects(): Project[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function saveAll(list: Project[]) { localStorage.setItem(KEY, JSON.stringify(list)); }

export function getProject(id: string): Project | null {
  return listProjects().find(p => p.id === id) || null;
}

export function upsertProject(p: Partial<Project> & { id?: string; name: string }): Project {
  const list = listProjects();
  let project: Project;
  if (p.id) {
    const i = list.findIndex(x => x.id === p.id);
    if (i >= 0) {
      project = { ...list[i], ...p, updatedAt: Date.now() } as Project;
      list[i] = project;
    } else {
      project = { ...(p as any), id: p.id, createdAt: Date.now(), updatedAt: Date.now() } as Project;
      list.unshift(project);
    }
  } else {
    project = { ...(p as any), id: uid(), createdAt: Date.now(), updatedAt: Date.now() } as Project;
    list.unshift(project);
  }
  saveAll(list);
  return project;
}

export function removeProject(id: string) {
  saveAll(listProjects().filter(p => p.id !== id));
}

export function exportProjectJSON(id: string): string {
  const p = getProject(id);
  if (!p) throw new Error("项目不存在");
  return JSON.stringify(p, null, 2);
}

export function importProjectFromJSON(json: string): Project {
  const obj = JSON.parse(json);
  if (!obj.name) throw new Error("JSON 非法：缺少 name");
  // 重新分配 id，避免覆盖
  const p: Project = { ...obj, id: uid(), createdAt: Date.now(), updatedAt: Date.now() };
  const list = listProjects(); list.unshift(p); saveAll(list);
  return p;
}
