import { putBlob, getBlob, delBlob } from "./idb";

const META_KEY = "ms.assets.v1";

export type AssetItem = {
  id: string;
  name: string;
  kind: "image" | "video";
  mime: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  createdAt: number;
  origKey: string;
  previewKey?: string;
  thumbKey?: string;
  thumbDataUrl?: string;
  // 云端长期地址（任务10）
  cloudOrigUrl?: string;
  cloudPreviewUrl?: string;
  cloudThumbUrl?: string;
};

export function listAssets(): AssetItem[] {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as AssetItem[]) : [];
  } catch { return []; }
}
function saveAssets(list: AssetItem[]) { localStorage.setItem(META_KEY, JSON.stringify(list)); }
export function updateAsset(partial: Partial<AssetItem> & { id: string }) {
  const list = listAssets();
  const idx = list.findIndex(a => a.id === partial.id);
  if (idx >= 0) { list[idx] = { ...list[idx], ...partial }; saveAssets(list); }
}
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function imageToCanvas(img: HTMLImageElement | ImageBitmap, maxWH = 1600) {
  const w = (img as any).width, h = (img as any).height;
  let nw = w, nh = h;
  if (Math.max(w, h) > maxWH) {
    if (w >= h) { nw = maxWH; nh = Math.round(h * (maxWH / w)); }
    else { nh = maxWH; nw = Math.round(w * (maxWH / h)); }
  }
  const canvas = document.createElement("canvas");
  canvas.width = nw; canvas.height = nh;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img as any, 0, 0, nw, nh);
  return canvas;
}

async function fileToImageBitmap(file: File) {
  const buf = await file.arrayBuffer();
  const blob = new Blob([buf], { type: file.type });
  return await createImageBitmap(blob);
}

async function captureVideoThumb(file: File, at = 0.2): Promise<{ canvas: HTMLCanvasElement; duration: number; videoW: number; videoH: number }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url; video.muted = true; video.playsInline = true;
  await new Promise<void>((res, rej) => { video.onloadedmetadata = () => res(); video.onerror = () => rej(new Error("视频元数据加载失败")); });
  try {
    if (!isNaN(video.duration) && isFinite(video.duration)) {
      video.currentTime = Math.min(Math.max(at, 0), Math.max(video.duration - 0.1, 0.1));
      await new Promise<void>((res) => { video.onseeked = () => res(); });
    }
  } catch {}
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d")!; ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const duration = isNaN(video.duration) ? 0 : video.duration;
  const videoW = video.videoWidth, videoH = video.videoHeight;
  URL.revokeObjectURL(url);
  return { canvas, duration, videoW, videoH };
}

export async function addImage(file: File): Promise<AssetItem> {
  const id = uid();
  const origKey = `asset:${id}:orig`;
  const previewKey = `asset:${id}:preview`;
  const thumbKey = `asset:${id}:thumb`;

  const bmp = await fileToImageBitmap(file);
  const previewCanvas = imageToCanvas(bmp, 1600);
  const thumbCanvas = imageToCanvas(bmp, 360);

  const previewBlob: Blob = await new Promise(res => previewCanvas.toBlob(b => res(b!), "image/jpeg", 0.85));
  const thumbBlob: Blob = await new Promise(res => thumbCanvas.toBlob(b => res(b!), "image/jpeg", 0.8));
  const thumbDataUrl = thumbCanvas.toDataURL("image/jpeg", 0.7);

  await putBlob(origKey, file);
  await putBlob(previewKey, previewBlob);
  await putBlob(thumbKey, thumbBlob);

  const item: AssetItem = {
    id, name: file.name, kind: "image", mime: file.type || "image/*", size: file.size,
    width: previewCanvas.width, height: previewCanvas.height,
    createdAt: Date.now(),
    origKey, previewKey, thumbKey, thumbDataUrl
  };
  const list = listAssets(); list.unshift(item); saveAssets(list);
  return item;
}

export async function addVideo(file: File): Promise<AssetItem> {
  const id = uid();
  const origKey = `asset:${id}:orig`;
  const thumbKey = `asset:${id}:thumb`;

  const { canvas, duration, videoW, videoH } = await captureVideoThumb(file, 0.2);
  const thumbScaled = imageToCanvas(canvas as any, 480);
  const thumbBlob: Blob = await new Promise(res => thumbScaled.toBlob(b => res(b!), "image/jpeg", 0.8));
  const thumbDataUrl = thumbScaled.toDataURL("image/jpeg", 0.7);

  await putBlob(origKey, file);
  await putBlob(thumbKey, thumbBlob);

  const item: AssetItem = {
    id, name: file.name, kind: "video", mime: file.type || "video/*", size: file.size,
    width: videoW, height: videoH, duration,
    createdAt: Date.now(),
    origKey, thumbKey, thumbDataUrl
  };
  const list = listAssets(); list.unshift(item); saveAssets(list);
  return item;
}

export async function deleteAsset(id: string) {
  const list = listAssets();
  const it = list.find(a => a.id === id); if (!it) return;
  await Promise.all([ delBlob(it.origKey), it.previewKey ? delBlob(it.previewKey) : null, it.thumbKey ? delBlob(it.thumbKey) : null ]);
  const next = list.filter(a => a.id !== id); saveAssets(next);
}

export async function blobUrl(key: string): Promise<string> {
  const b = await getBlob(key);
  if (!b) throw new Error("未找到文件数据");
  return URL.createObjectURL(b);
}

// 给上传到云使用
export { getBlob } from "./idb";
