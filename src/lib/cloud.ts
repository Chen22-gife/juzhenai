type SignResp = { key: string; putUrl: string; publicUrl: string; expiresIn: number };

export async function signUpload(params: { kind: "orig"|"preview"|"thumb"; ext: string; mime: string; size: number; prefix?: string }): Promise<SignResp> {
  const resp = await fetch("/api/backend/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!resp.ok) throw new Error(`签名失败 HTTP ${resp.status}`);
  return await resp.json();
}

export async function putToSignedUrl(putUrl: string, blob: Blob, mime: string) {
  const r = await fetch(putUrl, { method: "PUT", headers: { "Content-Type": mime }, body: blob });
  if (!r.ok) throw new Error(`上传失败 HTTP ${r.status}`);
}
