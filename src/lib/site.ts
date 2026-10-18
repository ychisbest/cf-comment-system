import type { Env, Site, SiteSettings } from '../types';
import { sha256Hex } from './hash';

export const DEFAULT_SETTINGS: SiteSettings = {
  lang: 'auto',
  pageSize: 20,
  allowImages: true,
  maxDepth: 3,
  maxLength: 3000,
  stripWww: true,
  queryMode: 'keep',
  ssrEnabled: true,
  ssrDelayHours: 24,
  ssrMaxComments: 50,
  maxLinks: 1,
  blacklist: [],
};

export function parseSettings(raw: string | null | undefined): SiteSettings {
  let o: Record<string, unknown> = {};
  try {
    o = JSON.parse(raw || '{}') ?? {};
  } catch {
    /* 使用默认 */
  }
  return coerceSettings({ ...DEFAULT_SETTINGS, ...o });
}

const num = (v: unknown, d: number, min: number, max: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : d;
};

/** 校验并规整站点设置（管理端写入前、读取后都经过它）。 */
export function coerceSettings(o: Partial<SiteSettings> & Record<string, unknown>): SiteSettings {
  const d = DEFAULT_SETTINGS;
  return {
    lang: typeof o.lang === 'string' ? o.lang.slice(0, 16) : d.lang,
    pageSize: num(o.pageSize, d.pageSize, 1, 50),
    allowImages: o.allowImages === undefined ? d.allowImages : !!o.allowImages,
    maxDepth: num(o.maxDepth, d.maxDepth, 1, 6),
    maxLength: num(o.maxLength, d.maxLength, 50, 10000),
    stripWww: o.stripWww === undefined ? d.stripWww : !!o.stripWww,
    queryMode: o.queryMode === 'drop' ? 'drop' : 'keep',
    ssrEnabled: o.ssrEnabled === undefined ? d.ssrEnabled : !!o.ssrEnabled,
    ssrDelayHours: num(o.ssrDelayHours, d.ssrDelayHours, 0, 24 * 365),
    ssrMaxComments: num(o.ssrMaxComments, d.ssrMaxComments, 1, 500),
    maxLinks: num(o.maxLinks, d.maxLinks, 0, 50),
    blacklist: Array.isArray(o.blacklist)
      ? o.blacklist.filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, 60)).filter(Boolean).slice(0, 200)
      : d.blacklist,
  };
}

export function rowToSite(r: { id: string; name: string; domains: string; custom_css: string | null; settings: string | null; created_at: number }): Site {
  let domains: string[] = [];
  try {
    const p = JSON.parse(r.domains);
    if (Array.isArray(p)) domains = p.filter((x) => typeof x === 'string');
  } catch {
    /* 空 */
  }
  return { id: r.id, name: r.name, domains, custom_css: r.custom_css ?? '', settings: parseSettings(r.settings), created_at: r.created_at };
}

export async function getSite(db: D1Database, id: unknown): Promise<Site | null> {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const r = await db.prepare('SELECT * FROM sites WHERE id = ?').bind(id).first<any>();
  return r ? rowToSite(r) : null;
}

/** 域名白名单规整：小写、去协议/路径，支持 "*.example.com" 与 "example.com:8080"。 */
export function normalizeDomainEntry(d: string): string {
  let s = d.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/[/?#].*$/, '');
  return s;
}

/** Origin 是否属于站点白名单。条目不带端口时匹配任意端口；"*.x.com" 匹配所有子域（不含 x.com 本身）。 */
export function originAllowed(origin: string | null | undefined, domains: string[]): boolean {
  if (!origin) return false;
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  const hostPort = u.host.toLowerCase();
  for (const raw of domains) {
    const d = normalizeDomainEntry(raw);
    if (!d) continue;
    if (d.startsWith('*.')) {
      const suffix = d.slice(1); // ".example.com"
      if (host.endsWith(suffix) && host.length > suffix.length) return true;
    } else if (d.includes(':')) {
      if (hostPort === d) return true;
    } else if (host === d) return true;
  }
  return false;
}

export function urlHostAllowed(url: string | null | undefined, domains: string[]): boolean {
  if (!url) return false;
  try {
    return originAllowed(new URL(url).origin, domains);
  } catch {
    return false;
  }
}

export function clientIp(req: Request): string {
  return req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'local';
}

export async function ipHashOf(env: Env, req: Request): Promise<string> {
  return sha256Hex(`ip:${env.IP_SALT}:${clientIp(req)}`);
}

export async function voterHashOf(env: Env, req: Request, siteId: string): Promise<string> {
  const ua = req.headers.get('User-Agent') ?? '';
  return sha256Hex(`voter:${env.IP_SALT}:${clientIp(req)}:${ua}:${siteId}`);
}
