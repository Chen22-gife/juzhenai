/** 工作流模板协议（单轮 Prompt 版，可扩展） */
export type VarSpec = { key: string; label: string; required?: boolean; placeholder?: string; };
export type WorkflowTemplate = {
  id: string;
  name: string;
  description?: string;
  // 默认模型（会根据 provider 过滤候选）
  defaultModel?: string;
  // 变量定义
  vars: VarSpec[];
  // system / user 提示词，支持 {{var}} 插值
  system?: string;
  user: string;
};

export type WorkflowPack = { version: "1.0"; templates: WorkflowTemplate[] };

/** 简单插值：把 {{key}} 替换为传入的值 */
export function renderTemplate(tpl: string, vars: Record<string,string>) {
  return tpl.replace(/{{\s*([\w.-]+)\s*}}/g, (_, k) => (vars[k] ?? ""));
}

/** 内置模板库 */
export const BUILTIN_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "copy-product-cn",
    name: "商品文案（中文）",
    description: "根据卖点与人设生成主文案 + 话题",
    defaultModel: "deepseek-chat",
    vars: [
      { key: "product", label: "商品/主题", required: true, placeholder: "便携榨汁杯" },
      { key: "selling_points", label: "核心卖点", required: true, placeholder: "轻便、好清洗、Type-C 充电" },
      { key: "persona", label: "账号人设", placeholder: "精致通勤女孩" },
      { key: "tone", label: "语气风格", placeholder: "轻松、口语化" },
    ],
    system: "你是电商短视频的资深编导，请严格输出 Markdown。",
    user:
`请基于以下信息产出中文短视频带货文案：
- 商品/主题：{{product}}
- 核心卖点：{{selling_points}}
- 账号人设：{{persona}}
- 语气风格：{{tone}}

输出结构（Markdown）：
# 开场3秒吸引句（≤15字）
## 主文案（80-150字）
## 话题（5-8个，#开头，逗号分隔）`
  },
  {
    id: "comment-reply-cn",
    name: "评论自动回复（中文）",
    description: "基于评论内容生成友好回复，避免敏感承诺",
    defaultModel: "deepseek-chat",
    vars: [
      { key: "comment", label: "用户评论", required: true, placeholder: "这个好清洗吗？" },
      { key: "brand", label: "品牌名", placeholder: "小橙杯" },
      { key: "policy", label: "合规注意点", placeholder: "不做疗效/收益承诺" },
    ],
    system: "你是品牌小编，语气亲和，避免夸大与敏感承诺。",
    user:
`评论：{{comment}}
品牌：{{brand}}
注意：{{policy}}

请生成友好、有帮助的回复（≤60字，1条）。`
  },
  {
    id: "subtitle-summary-cn",
    name: "字幕摘要（中文）",
    description: "把视频字幕总结成要点与金句",
    defaultModel: "gpt-4o-mini",
    vars: [
      { key: "subtitle", label: "字幕全文/片段", required: true, placeholder: "SRT/文本..." },
      { key: "audience", label: "目标受众", placeholder: "职场新人" },
    ],
    system: "你是专业字幕摘要助手。",
    user:
`请对以下字幕做要点摘要并提炼1-2句金句：
受众：{{audience}}
字幕：
{{subtitle}}

输出（Markdown）：
- 要点（3-5条）
- 金句（1-2句）`
  },
];
