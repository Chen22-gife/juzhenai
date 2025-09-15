# 矩阵文本ai

```powershell
@'
# Matrix Studio · 矩阵工作室

一个面向创作者的 **文本生成与风格管理** 小型工作台。支持浏览器直连 BYOK（Bring Your Own Key），可在本地开发环境通过 Vite 代理安全调用 **OpenAI / DeepSeek**；支持 **R2 对象存储**（签名直传）；支持 **网页风格库**：粘贴视频链接自动生成字幕并学习风格。

> 本仓库前端为 Vue 3 + Vite + TypeScript + Tailwind；server 为轻量 Node/Express（R2 签名 + 字幕/转写）。不依赖数据库。

---

## ✨ 功能

- **Settings（BYOK）**：本地保存 Provider / API Base / API Key（掩码显示，不存明文）。
- **Playground**：快速调试模型，展示耗时与用量。
- **Workflows / Workspace**：
  - 导入 **背景素材 / 要求素材**（TXT/DOCX/PDF；文件以卡片展示，内容后台解析）
  - 一键 **抽取变量** → 选择 **风格** → **多段生成**（标题/摘要/大纲/正文/CTA）
  - **项目存档** / 导出（JSON/Markdown/Word/PDF）
- **风格库 Styles**：
  - 由多样本学习风格画像并保存
  - 打开已保存风格，**对训练样本增删改** → 重新学习并**覆盖/另存为**
  - 学习时 **可选择 Provider**（DeepSeek / OpenAI）与**临时 API Base/Key**（不改全局）
- **网页风格库 WebStyles**：
  - 粘贴视频链接（YouTube/Bilibili/抖音/INS/TikTok）
  - **YouTube 优先抓字幕（免 Key）**；抓不到或其他平台→ **ASR 转写**（OpenAI：`gpt-4o-mini-transcribe`/`whisper-1`）
  - 将多条字幕作为样本学习风格，保存后在 Workspace 直接使用
- **R2 对象存储（可选）**：server 侧签名，前端直传并返回 CDN 地址。

---

## 🧭 目录结构

```

.
├─ src/                 # 前端（Vue 3 + Vite + TS + Tailwind）
│  ├─ lib/              # byok / models / aiTextOps / styleStore / subtitle 等
│  ├─ views/            # 各页面（含 WebStyles.vue）
│  └─ router/
├─ server/              # Node/Express：R2 签名 + 字幕/转写
│  ├─ index.js
│  ├─ package.json
│  └─ .env.example
├─ vite.config.ts       # 代理：/api/openai /api/deepseek /api/backend /api/subtitle
├─ package.json
└─ README.md

````

---

## 🛠️ 本地开发

### 前端
```bash
npm i
npm run dev
# 访问 http://127.0.0.1:5174/ （以 vite.config.ts 为准）
````

### 后端（签名 & 字幕）

```bash
cd server
npm i
npm run dev    # 若无脚本，可 node index.js
# 访问 http://localhost:8787/health
```

### Vite 开发代理（已内置）

* OpenAI：`/api/openai/*` → `https://api.openai.com/*`
* DeepSeek：`/api/deepseek/*` → `https://api.deepseek.com/*`
* 签名：`/api/backend/*` → `http://localhost:8787/*`
* 字幕：`/api/subtitle/*` → `http://localhost:8787/subtitle/*`

> 建议把前端 Base URL 设为 `/api/openai` 或 `/api/deepseek`，避免 CORS。

---

## 🔐 环境变量（server/.env）

将 `server/.env.example` 复制为 `server/.env` 并填写：

```ini
AWS_ACCESS_KEY_ID=your_r2_access_key
AWS_SECRET_ACCESS_KEY=your_r2_secret
R2_ACCOUNT_ID=你的 R2 Account ID
S3_BUCKET=juzhenai
S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
CDN_BASE=https://你的CDN域名或R2自定义域

# 可选：ASR 转写走服务端 Key（也可前端 BYOK 透传）
OPENAI_API_KEY=sk-xxx
PORT=8787
```

> 仓库已忽略 `.env`/密钥文件，请勿提交真实密钥。

---

## 📚 使用流程

1. **Settings**：选择 Provider（DeepSeek/OpenAI），配置 API Base（可用开发代理前缀）与 Key → **保存并测试**。
2. **WebStyles**：粘贴视频链接 → 自动获取字幕（YouTube 免 Key；其他站点用 ASR 需 OpenAI Key）→ 选择 Provider/模型 → **学习风格并保存**。
3. **Styles**：也可从文本/文件样本学习风格；可对已保存风格的“样本集”增删改后重新学习并覆盖/另存。
4. **Workspace**：导入背景/要求素材 → 抽取变量 → 选择风格 → 多段生成 → 导出/存档。

---

## 🚀 构建与部署

```bash
# 前端
npm run build
# 产物在 dist/，可部署任意静态托管（Nginx/Netlify/Vercel 等）

# 后端
cd server
npm ci
npm start
```

---

## ❓FAQ

* **浏览器打不开 localhost**：试 `http://127.0.0.1:5174/`；检查系统代理/安全软件；确认端口与 host。
* **PostCSS/ESM 报错**：`postcss.config.cjs` 使用 CJS；若为 `.js` 且 `type: module` 会报错。
* **字幕抓取失败**：换 ASR 转写（需 OpenAI Key）；或视频无公开字幕。
* **R2 上传 403/500**：检查 `S3_ENDPOINT/Bucket/AccountID` 与权限；先测 `GET /health`。

---
