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
  endpoint: S3_ENDPOINT || undefined,
  forcePathStyle: !!S3_ENDPOINT,
  credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// 仅调试：检查关键 env 是否加载（不回显具体值）
app.get("/debug-env", (_req, res) => {
  res.json({
    hasAWS_ACCESS_KEY_ID: !!AWS_ACCESS_KEY_ID,
    hasAWS_SECRET_ACCESS_KEY: !!AWS_SECRET_ACCESS_KEY,
    AWS_REGION,
    S3_BUCKET,
    S3_ENDPOINT,
    CDN_BASE
  });
});

const SignBody = z.object({
  kind: z.enum(["orig", "preview", "thumb"]),
  ext: z.string().min(1),
  mime: z.string().min(1),
  size: z.number().int().positive(),
  prefix: z.string().optional(),
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
      // （已移除 ACL，R2 不需要对象 ACL）
    });

    const expiresIn = 60 * 5;
    const putUrl = await getSignedUrl(s3, putCmd, { expiresIn });
    const publicUrl = `${CDN_BASE.replace(/\/+$/,"")}/${key}`;

    res.json({ key, putUrl, publicUrl, expiresIn });
  } catch (e) {
    // 显式打印详细错误，便于排障
    console.error("SIGN ERROR:", e);
    const msg = (e && (e as any).message) ? (e as any).message : String(e);
    res.status(500).json({ error: msg });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Sign server listening on http://localhost:${PORT}`);
});
