import { Hono, type Context } from 'hono';
import type { AppEnv, Env } from '../types';
import { timingSafeEqual, randomToken } from '../lib/hash';
import { ipHashOf, publicBase, rowToSite, coerceSettings, normalizeDomainEntry, DEFAULT_SETTINGS } from '../lib/site';
import { now, recountPages } from '../lib/db';

export const adminRoutes = new Hono<AppEnv>();
type Ctx = Context<AppEnv>;

const err = (c: Ctx, status: number, error: string, extra?: Record<string, string>) =>
  c.json({ error }, status as 400, { 'Cache-Control': 'no-store', ...extra });

// ---------- 鉴权：Bearer + 常量时间比较 + 失败次数限流 ----------

const MAX_FAILS = 10;
const FAIL_WINDOW = 600;

adminRoutes.use('/admin/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  const ipHash = await ipHashOf(c.env, c.req.raw);
  const slot = Math.floor(now() / FAIL_WINDOW);
  const key = `adminfail:${ipHash}:${slot}`;
  const row = await c.env.DB.prepare('SELECT count FROM rate_limits WHERE key = ?').bind(key).first<{ count: number }>();
  if ((row?.count ?? 0) >= MAX_FAILS) return err(c, 429, 'too_many_failures', { 'Retry-After': String(FAIL_WINDOW) });

  const m = /^Bearer (.+)$/.exec(c.req.header('Authorization') ?? '');
  const ok = !!c.env.ADMIN_TOKEN && c.env.ADMIN_TOKEN.length >= 8 && !!m && (await timingSafeEqual(m[1], c.env.ADMIN_TOKEN));
  if (!ok) {
    await c.env.DB.prepare(
      'INSERT INTO rate_limits (key, count, expires_at) VALUES (?1, 1, ?2) ON CONFLICT(key) DO UPDATE SET count = count + 1',
    ).bind(key, now() + FAIL_WINDOW * 2).run();
    return err(c, 401, 'unauthorized', { 'WWW-Authenticate': 'Bearer' });
  }
  await next();
});

async function body(c: Ctx): Promise<Record<string, any>> {
  try {
    const b = await c.req.json();
    return b && typeof b === 'object' ? b : {};
  } catch {
    return {};
  }
}

// ---------- 站点 ----------

const DOMAIN_RE = /^(\*\.)?[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/;

function cleanDomains(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = [...new Set(v.filter((x): x is string => typeof x === 'string').map(normalizeDomainEntry))].filter(Boolean);
  if (!out.length || out.length > 50 || out.some((d) => !DOMAIN_RE.test(d))) return null;
  return out;
}

function siteJson(r: any, base: string) {
  const s = rowToSite(r);
  return {
    ...s,
    embed_code: `<div id="comments"></div>\n<script src="${base}/widget.js" data-site="${s.id}" defer></script>`,
  };
}

const baseUrl = (c: Ctx) => publicBase(c.env, c.req.raw);

adminRoutes.get('/admin/api/sites', async (c) => {
  const rows = (await c.env.DB.prepare('SELECT * FROM sites ORDER BY created_at DESC').all()).results;
  return c.json({ sites: rows.map((r) => siteJson(r, baseUrl(c))) });
});

adminRoutes.post('/admin/api/sites', async (c) => {
  const b = await body(c);
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 100) : '';
  const domains = cleanDomains(b.domains);
  if (!name) return err(c, 400, 'name_required');
  if (!domains) return err(c, 400, 'invalid_domains');
  const css = typeof b.custom_css === 'string' ? b.custom_css.slice(0, 50_000) : '';
  const settings = coerceSettings({ ...DEFAULT_SETTINGS, ...(b.settings ?? {}) });
  const id = 'site_' + randomToken(5);
  await c.env.DB.prepare('INSERT INTO sites (id, name, domains, custom_css, settings, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, name, JSON.stringify(domains), css, JSON.stringify(settings), now()).run();
  const row = await c.env.DB.prepare('SELECT * FROM sites WHERE id = ?').bind(id).first();
  return c.json({ site: siteJson(row, baseUrl(c)) }, 201);
});

adminRoutes.patch('/admin/api/sites/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM sites WHERE id = ?').bind(id).first<any>();
  if (!row) return err(c, 404, 'not_found');
  const b = await body(c);
  const cur = rowToSite(row);
  let name = cur.name;
  let domains = cur.domains;
  let css = cur.custom_css;
  let settings = cur.settings;
  if (b.name !== undefined) {
    if (typeof b.name !== 'string' || !b.name.trim()) return err(c, 400, 'name_required');
    name = b.name.trim().slice(0, 100);
  }
  if (b.domains !== undefined) {
    const d = cleanDomains(b.domains);
    if (!d) return err(c, 400, 'invalid_domains');
    domains = d;
  }
  if (b.custom_css !== undefined) {
    if (typeof b.custom_css !== 'string') return err(c, 400, 'invalid_css');
    css = b.custom_css.slice(0, 50_000);
  }
  if (b.settings !== undefined) {
    if (typeof b.settings !== 'object' || !b.settings) return err(c, 400, 'invalid_settings');
    settings = coerceSettings({ ...cur.settings, ...b.settings });
  }
  await c.env.DB.prepare('UPDATE sites SET name = ?, domains = ?, custom_css = ?, settings = ? WHERE id = ?')
    .bind(name, JSON.stringify(domains), css, JSON.stringify(settings), id).run();
  const next = await c.env.DB.prepare('SELECT * FROM sites WHERE id = ?').bind(id).first();
  return c.json({ site: siteJson(next, baseUrl(c)) });
});

adminRoutes.delete('/admin/api/sites/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT id FROM sites WHERE id = ?').bind(id).first();
  if (!row) return err(c, 404, 'not_found');
  // 删除站点会连带删除所有评论与图片，要求显式确认
  if (c.req.query('confirm') !== id) return err(c, 400, 'confirm_required');
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const l = await c.env.BUCKET.list({ prefix: `uploads/${id}/`, cursor });
    keys.push(...l.objects.map((o) => o.key));
    cursor = l.truncated ? l.cursor : undefined;
  } while (cursor);
  for (let i = 0; i < keys.length; i += 1000) await c.env.BUCKET.delete(keys.slice(i, i + 1000));
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM votes WHERE comment_id IN (SELECT id FROM comments WHERE site_id = ?)').bind(id),
    c.env.DB.prepare('DELETE FROM subscriptions WHERE comment_id IN (SELECT id FROM comments WHERE site_id = ?)').bind(id),
    c.env.DB.prepare('DELETE FROM comments WHERE site_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM pages WHERE site_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM uploads WHERE site_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM bans WHERE site_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM sites WHERE id = ?').bind(id),
  ]);
  return c.json({ ok: true, deleted_images: keys.length });
});

// ---------- 评论 ----------

const STATUSES = ['visible', 'hidden', 'spam', 'deleted'] as const;

function parseSince(v: string | undefined): number | null {
  if (!v) return null;
  if (/^\d+$/.test(v)) return Number(v);
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}

adminRoutes.get('/admin/api/comments', async (c) => {
  const q = c.req.query();
  const where: string[] = [];
  const binds: unknown[] = [];
  if (q.site) { where.push('c.site_id = ?'); binds.push(q.site); }
  if (q.status) {
    if (!(STATUSES as readonly string[]).includes(q.status)) return err(c, 400, 'invalid_status');
    where.push('c.status = ?'); binds.push(q.status);
  }
  if (q.flagged === '1' || q.pending === '1') where.push("c.flagged = 1 AND c.status = 'visible'");
  if (q.ip_hash) { where.push('c.ip_hash = ?'); binds.push(q.ip_hash); }
  if (q.page_key) { where.push('p.page_key = ?'); binds.push(q.page_key); }
  if (q.q) {
    const like = '%' + q.q.replace(/[\\%_]/g, (m) => '\\' + m) + '%';
    where.push("(c.content LIKE ? ESCAPE '\\' OR c.nickname LIKE ? ESCAPE '\\')");
    binds.push(like, like);
  }
  const since = parseSince(q.since);
  if (q.since && since === null) return err(c, 400, 'invalid_since');
  if (since !== null) { where.push('c.created_at >= ?'); binds.push(since); }
  const cursor = Math.floor(Number(q.cursor) || 0);
  if (cursor) { where.push('c.id < ?'); binds.push(cursor); }
  const limit = Math.min(100, Math.max(1, Math.floor(Number(q.limit) || 30)));
  const sql = `SELECT c.id, c.site_id, c.page_id, p.page_key, p.title AS page_title, p.url AS page_url, c.parent_id, c.root_id, c.nickname,
      (c.email IS NOT NULL AND c.email != '') AS has_email, c.content, c.image_key, c.status, c.flagged, c.likes, c.dislikes, c.ip_hash, c.created_at
    FROM comments c JOIN pages p ON p.id = c.page_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.id DESC LIMIT ${limit + 1}`;
  const rows = (await c.env.DB.prepare(sql).bind(...binds).all<any>()).results;
  const more = rows.length > limit;
  if (more) rows.pop();
  const comments = rows.map((r) => ({ ...r, has_email: !!r.has_email, pending_review: r.flagged === 1 }));
  return c.json({ comments, next_cursor: more ? rows[rows.length - 1].id : null });
});

async function deleteCommentsHard(env: Env, ids: number[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const ph = chunk.map(() => '?').join(',');
    const imgs = (await env.DB.prepare(`SELECT image_key FROM comments WHERE id IN (${ph}) AND image_key IS NOT NULL`).bind(...chunk).all<{ image_key: string }>()).results;
    if (imgs.length) await env.BUCKET.delete(imgs.map((x) => x.image_key));
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM votes WHERE comment_id IN (${ph})`).bind(...chunk),
      env.DB.prepare(`DELETE FROM subscriptions WHERE comment_id IN (${ph})`).bind(...chunk),
      env.DB.prepare(`DELETE FROM uploads WHERE comment_id IN (${ph})`).bind(...chunk),
      env.DB.prepare(`DELETE FROM comments WHERE id IN (${ph})`).bind(...chunk),
    ]);
  }
}

type Action = 'hide' | 'spam' | 'restore' | 'delete' | 'approve';
const ACTIONS: Action[] = ['hide', 'spam', 'restore', 'delete', 'approve'];

async function applyAction(c: Ctx, ids: number[], action: Action): Promise<number> {
  const env = c.env;
  let updated = 0;
  const pages: number[] = [];
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const ph = chunk.map(() => '?').join(',');
    const found = (await env.DB.prepare(`SELECT id, page_id FROM comments WHERE id IN (${ph})`).bind(...chunk).all<{ id: number; page_id: number }>()).results;
    if (!found.length) continue;
    pages.push(...found.map((f) => f.page_id));
    const fids = found.map((f) => f.id);
    if (action === 'delete') await deleteCommentsHard(env, fids);
    else {
      const fph = fids.map(() => '?').join(',');
      const set = { hide: "status = 'hidden'", spam: "status = 'spam'", restore: "status = 'visible', flagged = CASE WHEN flagged = 1 THEN 2 ELSE flagged END", approve: 'flagged = 2' }[action];
      await env.DB.prepare(`UPDATE comments SET ${set} WHERE id IN (${fph})`).bind(...fids).run();
    }
    updated += found.length;
  }
  await recountPages(env.DB, pages);
  return updated;
}

adminRoutes.patch('/admin/api/comments/:id', async (c) => {
  const id = Math.floor(Number(c.req.param('id')));
  const b = await body(c);
  const map: Record<string, Action> = { hidden: 'hide', spam: 'spam', visible: 'restore' };
  let n = 0;
  if (b.status !== undefined) {
    const a = map[b.status];
    if (!a) return err(c, 400, 'invalid_status');
    n = await applyAction(c, [id], a);
  }
  if (b.approved === true) n = await applyAction(c, [id], 'approve');
  if (b.status === undefined && b.approved === undefined) return err(c, 400, 'nothing_to_update');
  if (!n) return err(c, 404, 'not_found');
  return c.json({ ok: true });
});

adminRoutes.delete('/admin/api/comments/:id', async (c) => {
  const n = await applyAction(c, [Math.floor(Number(c.req.param('id')))], 'delete');
  return n ? c.json({ ok: true }) : err(c, 404, 'not_found');
});

adminRoutes.post('/admin/api/comments/bulk', async (c) => {
  const b = await body(c);
  const action = b.action as Action;
  if (!ACTIONS.includes(action)) return err(c, 400, 'invalid_action');
  if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 200) return err(c, 400, 'invalid_ids');
  const ids = b.ids.map((x: unknown) => Math.floor(Number(x))).filter((x: number) => Number.isFinite(x) && x > 0);
  if (!ids.length) return err(c, 400, 'invalid_ids');
  return c.json({ ok: true, updated: await applyAction(c, ids, action) });
});

// ---------- 封禁 ----------

adminRoutes.get('/admin/api/bans', async (c) => {
  const rows = (await c.env.DB.prepare('SELECT * FROM bans ORDER BY id DESC LIMIT 500').all()).results;
  return c.json({ bans: rows });
});

adminRoutes.post('/admin/api/bans', async (c) => {
  const b = await body(c);
  let ipHash: string | null = typeof b.ip_hash === 'string' ? b.ip_hash : null;
  let siteId: string | null = typeof b.site_id === 'string' && b.site_id ? b.site_id : null;
  if (b.comment_id != null) {
    const r = await c.env.DB.prepare('SELECT ip_hash, site_id FROM comments WHERE id = ?').bind(Math.floor(Number(b.comment_id))).first<{ ip_hash: string; site_id: string }>();
    if (!r) return err(c, 404, 'comment_not_found');
    ipHash = r.ip_hash;
    siteId = b.scope === 'global' ? null : r.site_id;
  }
  if (!ipHash || !/^[0-9a-f]{64}$/.test(ipHash)) return err(c, 400, 'ip_hash_required');
  const reason = typeof b.reason === 'string' ? b.reason.slice(0, 200) : '';
  const exists = await c.env.DB.prepare('SELECT id FROM bans WHERE ip_hash = ? AND site_id IS ?').bind(ipHash, siteId).first<{ id: number }>();
  let id = exists?.id;
  if (!id) {
    const r = await c.env.DB.prepare('INSERT INTO bans (site_id, ip_hash, reason, created_at) VALUES (?, ?, ?, ?) RETURNING id').bind(siteId, ipHash, reason, now()).first<{ id: number }>();
    id = r!.id;
  }
  let hidden = 0;
  if (b.hide_existing === true) {
    const q = siteId
      ? c.env.DB.prepare("UPDATE comments SET status = 'hidden' WHERE ip_hash = ? AND site_id = ? AND status = 'visible'").bind(ipHash, siteId)
      : c.env.DB.prepare("UPDATE comments SET status = 'hidden' WHERE ip_hash = ? AND status = 'visible'").bind(ipHash);
    hidden = (await q.run()).meta.changes ?? 0;
    const pgs = (await c.env.DB.prepare('SELECT DISTINCT page_id FROM comments WHERE ip_hash = ?').bind(ipHash).all<{ page_id: number }>()).results;
    await recountPages(c.env.DB, pgs.map((p) => p.page_id));
  }
  return c.json({ ok: true, id, hidden_comments: hidden }, 201);
});

adminRoutes.delete('/admin/api/bans/:id', async (c) => {
  const r = await c.env.DB.prepare('DELETE FROM bans WHERE id = ?').bind(Math.floor(Number(c.req.param('id')))).run();
  return r.meta.changes ? c.json({ ok: true }) : err(c, 404, 'not_found');
});

// ---------- 统计 ----------

adminRoutes.get('/admin/api/stats', async (c) => {
  const since = now() - 86400;
  const rows = (
    await c.env.DB.prepare(
      `SELECT s.id AS site_id, s.name,
         COALESCE(SUM(c.status = 'visible'), 0) AS visible,
         COALESCE(SUM(c.status = 'hidden'), 0) AS hidden,
         COALESCE(SUM(c.status = 'spam'), 0) AS spam,
         COALESCE(SUM(c.status = 'visible' AND c.created_at >= ?1), 0) AS last_24h,
         COALESCE(SUM(c.status = 'visible' AND c.flagged = 1), 0) AS pending_review
       FROM sites s LEFT JOIN comments c ON c.site_id = s.id GROUP BY s.id ORDER BY s.created_at DESC`,
    ).bind(since).all<any>()
  ).results;
  const total = rows.reduce(
    (a, r) => ({ visible: a.visible + r.visible, hidden: a.hidden + r.hidden, spam: a.spam + r.spam, last_24h: a.last_24h + r.last_24h, pending_review: a.pending_review + r.pending_review }),
    { visible: 0, hidden: 0, spam: 0, last_24h: 0, pending_review: 0 },
  );
  return c.json({ sites: rows, total, generated_at: now() });
});

// ---------- 后台页面（静态资源） ----------

const ADMIN_CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

async function serveAdminAsset(c: Ctx, path: string): Promise<Response> {
  const res = await c.env.ASSETS.fetch(new Request(new URL(path, c.req.url)));
  if (!res.ok) return c.text('not found', 404);
  const h = new Headers(res.headers);
  h.set('Content-Security-Policy', ADMIN_CSP);
  h.set('Cache-Control', 'no-store');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'no-referrer');
  h.set('X-Frame-Options', 'DENY');
  return new Response(res.body, { status: 200, headers: h });
}

adminRoutes.get('/admin', (c) => serveAdminAsset(c, '/admin/'));
adminRoutes.get('/admin/', (c) => serveAdminAsset(c, '/admin/'));
adminRoutes.get('/admin/admin.js', (c) => serveAdminAsset(c, '/admin/admin.js'));
adminRoutes.get('/admin/admin.css', (c) => serveAdminAsset(c, '/admin/admin.css'));
