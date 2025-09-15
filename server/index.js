import "dotenv/config";
import express from "express";
import cors from "cors";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

const PORT = process.env.PORT || 8787;

const {
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_REGION = "auto",
  S3_BUCKET,
  S3_ENDPOINT,
  CDN_BASE
} = process.env;

if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !S3_BUCKET || !CDN_BASE) {
  console.error("❌ 环境变量缺失：请填写 .env（至少 AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / S3_BUCKET / CDN_BASE）");
  process.exit(1);
}

const s3 = new S3Client({
  region: AWS_REGION,
  endpoint: S3_ENDPOINT || undefined,     // R2/MinIO/OSS 走自定义端点
  forcePathStyle: !!S3_ENDPOINT,          // 兼容 MinIO 等
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

const SignBody = z.object({
  kind: z.enum(["orig", "preview", "thumb"]),
  ext: z.string().min(1),                 // 如 jpg / png / mp4
  mime: z.string().min(1),                // 如 image/jpeg
  size: z.number().int().positive(),      // 字节
  prefix: z.string().optional(),          // 可选：自定义业务前缀
});

app.post("/sign", async (req, res) => {
  try {
    const body = SignBody.parse(req.body);
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    const d = String(now.getUTCDate()).padStart(2, "0");
    const uid = uuidv4().replace(/-/g, "");
    const safeExt = body.ext.replace(/[^a-zA-Z0-9]/g, "");
    const prefix = (body.prefix || "uploads").replace(/[^a-zA-Z0-9/_-]/g, "");
    const key = `${prefix}/${y}/${m}/${d}/${body.kind}-${uid}.${safeExt}`;

    const putCmd = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: body.mime,
      // 可选：限制大小/元数据等
      // ContentLength: body.size,
      ACL: "public-read" // 若使用 OSS/R2 不一定生效，建议走 CDN 域访问
    });

    const expiresIn = 60 * 5; // 5分钟
    const putUrl = await getSignedUrl(s3, putCmd, { expiresIn });
    const publicUrl = `${CDN_BASE.replace(/\/+$/,"")}/${key}`;

    res.json({ key, putUrl, publicUrl, expiresIn });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Sign server listening on http://localhost:${PORT}`);
});

// index.js 追加/合并 —— 保持你已有的 R2 签名服务不变
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");         // v2
const FormData = require("form-data");
const ytdlp = require("yt-dlp-exec");
const { YoutubeTranscript } = require("youtube-transcript");

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "2mb" }));

// ===== 工具 =====
function detectPlatform(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, "");
    if (h.includes("youtube.com") || h.includes("youtu.be")) return "youtube";
    if (h.includes("bilibili.com")) return "bilibili";
    if (h.includes("douyin.com") || h.includes("iesdouyin.com")) return "douyin";
    if (h.includes("instagram.com")) return "instagram";
    if (h.includes("tiktok.com")) return "tiktok";
    return "other";
  } catch { return "other"; }
}

// ===== 1) 优先抓取现成字幕（目前支持 YouTube，免 Key）=====
app.post("/subtitle/grab", async (req, res) => {
  try {
    const { url, lang } = req.body || {};
    if (!url) return res.status(400).json({ ok: false, message: "missing url" });
    const platform = detectPlatform(url);
    if (platform !== "youtube") {
      return res.status(400).json({ ok: false, message: "grab only supports youtube, use /subtitle/asr" });
    }
    // youtube-transcript 无需 API Key；会尝试多语言自动字幕
    const list = await YoutubeTranscript.fetchTranscript(url, { lang: lang || "zh-Hans,en" });
    // 合并为纯文本 + SRT
    let text = list.map(x => x.text).join(" ");
    // 简单 SRT
    const srt = list.map((x, i) => {
      const toSrtTime = (t) => {
        const ms = Math.floor((t % 1) * 1000);
        const total = Math.floor(t);
        const h = String(Math.floor(total / 3600)).padStart(2, "0");
        const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
        const s = String(total % 60).padStart(2, "0");
        return `${h}:${m}:${s},${String(ms).padStart(3, "0")}`;
      };
      const start = x.offset / 1000;
      const end = start + (x.duration ? x.duration / 1000 : 2);
      return `${i + 1}\n${toSrtTime(start)} --> ${toSrtTime(end)}\n${x.text}\n`;
    }).join("\n");
    res.json({ ok: true, platform: "youtube", text, srt });
  } catch (e) {
    res.status(500).json({ ok: false, message: String(e && e.message || e) });
  }
});

// ===== 2) 语音转写（ASR）：yt-dlp 抽音频 -> OpenAI Whisper 转录 =====
app.post("/subtitle/asr", async (req, res) => {
  try {
    const { url, model } = req.body || {};
    const provider = req.headers["x-provider"];       // 目前仅支持 openai
    const apiKey = req.headers["x-api-key"];
    if (!url) return res.status(400).json({ ok: false, message: "missing url" });
    if (!provider || !apiKey) return res.status(401).json({ ok: false, message: "missing provider/api key" });
    if (provider !== "openai") return res.status(400).json({ ok: false, message: "only openai asr supported for now" });

    // 用 yt-dlp 抓音频（不落盘，走 stdout pipe）
    // 注意：第一次运行会自动下载 yt-dlp，可稍久；后续很快
    const proc = ytdlp(url, {
      output: "-",             // stdout
      format: "bestaudio/best",
      restrictFilenames: true,
      noCheckCertificates: true,
      extractAudio: true,
      audioFormat: "mp3",
      audioQuality: 0,
      // 超时/重试：
      retries: 3,
      noWarnings: true,
      dumpSingleJson: false
    }, { stdio: ["ignore", "pipe", "pipe"] });

    // 构造 multipart 发送给 OpenAI /v1/audio/transcriptions
    // 模型默认优先 gpt-4o-mini-transcribe，不支持时可改 whisper-1
    const chosenModel = model || "gpt-4o-mini-transcribe";
    const form = new FormData();
    form.append("model", chosenModel);
    form.append("response_format", "verbose_json"); // 拿到段落/时间戳更丰富
    form.append("temperature", "0");

    // 把 yt-dlp stdout 作为 file 字段流式上传
    form.append("file", proc.stdout, { filename: "audio.mp3", contentType: "audio/mpeg" });

    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, ...form.getHeaders() },
      body: form
    });

    if (!r.ok) {
      const t = await r.text().catch(()=> "");
      return res.status(r.status).json({ ok: false, message: `OpenAI ${r.status}: ${t.slice(0,300)}` });
    }
    const data = await r.json();
    // 兼容 verbose_json 返回
    const text = data.text || "";
    // 简单把 segments 转 SRT
    let srt = "";
    if (Array.isArray(data.segments)) {
      srt = data.segments.map((seg, i) => {
        const toSrtTime = (sec) => {
          const ms = Math.floor((sec % 1) * 1000);
          const total = Math.floor(sec);
          const h = String(Math.floor(total / 3600)).padStart(2, "0");
          const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
          const s = String(total % 60).padStart(2, "0");
          return `${h}:${m}:${s},${String(ms).padStart(3, "0")}`;
        };
        return `${i + 1}\n${toSrtTime(seg.start)} --> ${toSrtTime(seg.end)}\n${seg.text}\n`;
      }).join("\n");
    }
    res.json({ ok: true, platform: detectPlatform(url), text, srt, model: chosenModel });
  } catch (e) {
    res.status(500).json({ ok: false, message: String(e && e.message || e) });
  }
});

// ===== 其余你已有的 /sign 路由、健康检查等保持不变 =====

// 启动（若你已有 app.listen，请勿重复启动）
const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`✅ Sign/Subtitle server on http://localhost:${PORT}`));
