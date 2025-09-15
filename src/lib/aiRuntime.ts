/** 通用 AI 调用运行时：并发限制、最小间隔节流、超时、指数退避重试 */
type RetryCfg = { retries: number; baseDelayMs: number; factor: number };
type RuntimeCfg = {
  maxConcurrent: number;      // 同时最多请求数
  minIntervalMs: number;      // 两次请求之间的最小间隔
  timeoutMs: number;          // 单次请求超时
  retry: RetryCfg;            // 重试策略
};

const cfg: RuntimeCfg = {
  maxConcurrent: 4,
  minIntervalMs: 120,
  timeoutMs: 30_000,
  retry: { retries: 2, baseDelayMs: 600, factor: 2 },
};

/** 简单信号量 */
class Semaphore {
  private max: number;
  private current = 0;
  private queue: Array<() => void> = [];
  constructor(max: number) { this.max = max; }
  async acquire() {
    if (this.current < this.max) { this.current++; return; }
    await new Promise<void>(res => this.queue.push(res));
    this.current++;
  }
  release() {
    this.current = Math.max(0, this.current - 1);
    const next = this.queue.shift(); if (next) next();
  }
}
const sem = new Semaphore(cfg.maxConcurrent);

/** 节流：保证相邻请求间隔 */
let lastAt = 0;
async function throttle(minGap: number) {
  const now = Date.now();
  const diff = now - lastAt;
  if (diff < minGap) await delay(minGap - diff);
  lastAt = Date.now();
}
function delay(ms: number) { return new Promise(res => setTimeout(res, ms)); }
function isRetryable(status: number) {
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}

export async function fetchJson(
  url: string,
  options: RequestInit & { timeoutMs?: number; retryCfg?: Partial<RetryCfg> } = {}
): Promise<{ data: any; text: string; response: Response; durationMs: number }> {
  const rCfg: RetryCfg = { ...cfg.retry, ...(options.retryCfg || {}) };
  const timeoutMs = options.timeoutMs ?? cfg.timeoutMs;

  await sem.acquire();
  try {
    await throttle(cfg.minIntervalMs);

    let attempt = 0;
    let lastErr: any = null;
    const t0 = performance.now?.() ?? Date.now();

    while (attempt <= rCfg.retries) {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), timeoutMs);

      try {
        const resp = await fetch(url, { ...options, signal: ac.signal });
        clearTimeout(t);
        const text = await resp.text();
        const durationMs = Math.round((performance.now?.() ?? Date.now()) - t0);

        if (resp.ok) {
          let data: any = null;
          try { data = text ? JSON.parse(text) : null; } catch { data = null; }
          return { data, text, response: resp, durationMs };
        }
        // 非 2xx：决定是否重试
        if (!isRetryable(resp.status)) {
          return { data: null, text, response: resp, durationMs };
        }
        // 429/5xx：按指数退避
        const retryAfter = Number(resp.headers.get("retry-after")) || 0;
        const backoff = retryAfter > 0 ? retryAfter * 1000 : rCfg.baseDelayMs * Math.pow(rCfg.factor, attempt);
        await delay(backoff);
        attempt++;
        continue;
      } catch (e: any) {
        clearTimeout(t);
        lastErr = e;
        // 被 abort 或网络错误 -> 继续重试
        if (attempt < rCfg.retries) {
          const backoff = rCfg.baseDelayMs * Math.pow(rCfg.factor, attempt);
          await delay(backoff);
          attempt++;
          continue;
        }
        // 超出重试
        const durationMs = Math.round((performance.now?.() ?? Date.now()) - t0);
        throw new Error(`网络/超时错误：${e?.message || e}（耗时 ${durationMs}ms）`);
      }
    }
    throw lastErr || new Error("未知错误");
  } finally {
    sem.release();
  }
}

/** 允许在运行时调整（可选） */
export function setRuntimeConfig(partial: Partial<RuntimeCfg>) {
  if (partial.maxConcurrent && partial.maxConcurrent > 0) {
    // @ts-ignore
    cfg.maxConcurrent = partial.maxConcurrent;
  }
  if (typeof partial.minIntervalMs === "number") cfg.minIntervalMs = partial.minIntervalMs!;
  if (typeof partial.timeoutMs === "number") cfg.timeoutMs = partial.timeoutMs!;
  if (partial.retry) Object.assign(cfg.retry, partial.retry);
}
