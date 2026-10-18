// URL 规范化：服务端与 widget 共用同一份逻辑（不依赖任何运行时 API，只用标准 URL）。

export interface NormalizeOptions {
  stripWww?: boolean; // 默认 true
  queryMode?: 'keep' | 'drop'; // 默认 keep
}

const TRACKING_PARAM = /^(utm_.*|fbclid|gclid|dclid|gbraid|wbraid|msclkid|yclid|twclid|mc_cid|mc_eid|_ga|_gl|igshid|ref|ref_src|ref_url|spm|share_token|from)$/i;

/**
 * 规范化为 `host/path?query`（不含 scheme 与 hash）。非 http(s) 或无法解析返回 null。
 * 幂等：对结果再补上 scheme 重新规范化得到相同值。
 */
export function normalizeUrl(input: string, opts: NormalizeOptions = {}, base?: string): string | null {
  let u: URL;
  try {
    u = new URL(input, base);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

  let host = u.hostname.toLowerCase();
  if (opts.stripWww !== false && host.startsWith('www.')) host = host.slice(4);
  // URL 已丢弃默认端口；保留非默认端口
  if (u.port) host += ':' + u.port;

  let path = u.pathname || '/';
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1 && path.endsWith('/')) path = path.replace(/\/+$/, '') || '/';

  let query = '';
  if (opts.queryMode !== 'drop') {
    const pairs: [string, string][] = [];
    u.searchParams.forEach((v, k) => {
      if (!TRACKING_PARAM.test(k)) pairs.push([k, v]);
    });
    pairs.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1));
    if (pairs.length) {
      query = '?' + pairs.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
    }
  }
  return host + path + query;
}

/** 计算 page_key：data-page-id 优先，其次规范化 URL。 */
export function pageKeyFor(pageId: string | null | undefined, url: string | null | undefined, opts: NormalizeOptions = {}): string | null {
  const id = (pageId ?? '').trim();
  if (id) return 'id:' + id.slice(0, 200);
  if (!url) return null;
  const n = normalizeUrl(url, opts);
  return n ? n.slice(0, 1000) : null;
}

/** widget 端：canonical 优先，再回落到当前地址。 */
export function resolvePageUrl(canonicalHref: string | null | undefined, locationHref: string): string {
  if (canonicalHref) {
    try {
      const c = new URL(canonicalHref, locationHref);
      if (c.protocol === 'http:' || c.protocol === 'https:') return c.href;
    } catch {
      /* 忽略 */
    }
  }
  return locationHref;
}
