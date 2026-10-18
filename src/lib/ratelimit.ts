export interface Rule {
  window: number; // 秒
  max: number;
}

export interface CounterStore {
  /** 原子地 +1 并返回新计数；ttl 秒后可被清理。 */
  incr(key: string, ttl: number): Promise<number>;
}

export const MINUTE = 60;
export const HOUR = 3600;
export const DAY = 86400;

/** 解析 "3/20/100" → 每分钟 3、每小时 20、每天 100；无效值回落到默认。 */
export function parseRules(spec: string | undefined, fallback: string): Rule[] {
  const parse = (s: string) => {
    const p = s.split('/').map((x) => Number(x.trim()));
    return p.length === 3 && p.every((n) => Number.isFinite(n) && n > 0) ? p : null;
  };
  const [m, h, d] = parse(spec ?? '') ?? parse(fallback)!;
  return [
    { window: MINUTE, max: m },
    { window: HOUR, max: h },
    { window: DAY, max: d },
  ];
}

export interface LimitResult {
  ok: boolean;
  retryAfter: number; // 秒，ok=false 时有意义
}

/** 固定窗口限流：对所有窗口计数，任一超限即拒绝。 */
export async function checkRateLimit(store: CounterStore, scope: string, id: string, rules: Rule[], nowSec: number): Promise<LimitResult> {
  let retryAfter = 0;
  for (const r of rules) {
    const start = Math.floor(nowSec / r.window) * r.window;
    const count = await store.incr(`${scope}:${id}:${r.window}:${start}`, r.window + 60);
    if (count > r.max) retryAfter = Math.max(retryAfter, start + r.window - nowSec);
  }
  return { ok: retryAfter === 0, retryAfter };
}

export function d1Store(db: D1Database): CounterStore {
  return {
    async incr(key, ttl) {
      const exp = Math.floor(Date.now() / 1000) + ttl;
      const r = await db
        .prepare('INSERT INTO rate_limits (key, count, expires_at) VALUES (?1, 1, ?2) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count')
        .bind(key, exp)
        .first<{ count: number }>();
      return r!.count;
    },
  };
}
