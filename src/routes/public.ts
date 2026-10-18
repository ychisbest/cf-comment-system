import { Hono, type Context } from 'hono';
import type { AppEnv, Site } from '../types';
import { getSite, originAllowed, urlHostAllowed, ipHashOf, voterHashOf } from '../lib/site';
import { pageKeyFor } from '../lib/url';
import { sanitizeText, sanitizeNickname, sanitizeLine, sanitizeEmail, countLinks, containsBlacklisted } from '../lib/sanitize';
import { sha256Hex } from '../lib/hash';
import { now, recountPages } from '../lib/db';

export const publicRoutes = new Hono<AppEnv>();

type Ctx = Context<AppEnv>;

// ---------- CORS / 来源校验 ----------

const CORS_HEADERS = 'Content-Type';

/** 预检：站点在 body 里，预检时不可见，这里只反射 Origin；真正的请求会做白名单校验。 */
publicRoutes.options('/api/*', (c) => {
  const origin = c.req.header('Origin');
  const h = new Headers({
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': CORS_HEADERS,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  });
  if (origin) h.set('Access-Control-Allow-Origin', origin);
  return new Response(null, { status: 204, headers: h });
});

export function json(c: Ctx, body: unknown, status = 200, origin?: string | null, extra: Record<string, string> = {}): Response {
  const h = new Headers({ 'Content-Type': 'application/json; charset=utf-8', Vary: 'Origin', 'X-Content-Type-Options': 'nosniff', ...extra });
  if (origin) h.set('Access-Control-Allow-Origin', origin);
  return new Response(JSON.stringify(body), { status, headers: h });
}

export const fail = (c: Ctx, status: number, error: string, extra: Record<string, string> = {}) => json(c, { error }, status, null, extra);

/** 校验站点存在且 Origin 在白名单内。 */
export async function guard(c: Ctx, siteId: unknown): Promise<{ site: Site; origin: string } | Response> {
  const site = await getSite(c.env.DB, siteId);
  if (!site) return fail(c, 404, 'unknown_site');
  const origin = c.req.header('Origin') ?? null;
  if (!originAllowed(origin, site.domains)) return fail(c, 403, 'origin_not_allowed');
  return { site, origin: origin! };
}

// ---------- 公共评论结构 ----------

interface CommentRow {
  id: number;
  parent_id: number | null;
  root_id: number | null;
  nickname: string;
  email_hash: string | null;
  content: string;
  image_key: string | null;
  likes: number;
  dislikes: number;
  created_at: number;
  flagged?: number;
}

export function toPublic(r: CommentRow, myVote = 0) {
  // 不返回 email / ip_hash
  return {
    id: r.id,
    parent_id: r.parent_id,
    root_id: r.root_id,
    nickname: r.nickname,
    avatar: r.email_hash ? r.email_hash.slice(0, 16) : null,
    content: r.content,
    image: r.image_key,
    likes: r.likes,
    dislikes: r.dislikes,
    created_at: r.created_at,
    my_vote: myVote,
  };
}

const COLS = 'id, parent_id, root_id, nickname, email_hash, content, image_key, likes, dislikes, created_at, flagged';

function publicSettings(site: Site) {
  const s = site.settings;
  return { lang: s.lang, pageSize: s.pageSize, allowImages: s.allowImages, maxDepth: s.maxDepth, maxLength: s.maxLength };
}

// ---------- 读取评论 ----------

publicRoutes.get('/api/comments', async (c) => {
  const q = c.req.query();
  const g = await guard(c, q.site);
  if (g instanceof Response) return g;
  const { site, origin } = g;
  const key = pageKeyFor(q.page_id, q.url, site.settings);
  if (!key) return fail(c, 400, 'bad_url');

  const first = !q.cursor;
  const cfg = first ? { settings: publicSettings(site), custom_css: site.custom_css, turnstile_sitekey: c.env.TURNSTILE_SITEKEY } : undefined;
  const page = await c.env.DB.prepare('SELECT id, comment_count FROM pages WHERE site_id = ? AND page_key = ?').bind(site.id, key).first<{ id: number; comment_count: number }>();
  const hdr = { 'Cache-Control': 'private, max-age=5' };
  if (!page) return json(c, { comments: [], total: 0, next_cursor: null, config: cfg }, 200, origin, hdr);

  const sort = q.sort === 'hot' ? 'hot' : q.sort === 'old' ? 'old' : 'new';
  const limit = site.settings.pageSize;
  const cursor = Math.max(0, Math.floor(Number(q.cursor) || 0));
  let sql = `SELECT ${COLS} FROM comments WHERE page_id = ? AND parent_id IS NULL AND status = 'visible'`;
  const binds: unknown[] = [page.id];
  let offset = 0;
  if (sort === 'new') {
    if (cursor) { sql += ' AND id < ?'; binds.push(cursor); }
    sql += ' ORDER BY id DESC';
  } else if (sort === 'old') {
    if (cursor) { sql += ' AND id > ?'; binds.push(cursor); }
    sql += ' ORDER BY id ASC';
  } else {
    offset = cursor;
    sql += ' ORDER BY (likes - dislikes) DESC, id DESC';
  }
  sql += ` LIMIT ${limit + 1}` + (offset ? ` OFFSET ${offset}` : '');
  const top = (await c.env.DB.prepare(sql).bind(...binds).all<CommentRow>()).results;
  const hasMore = top.length > limit;
  if (hasMore) top.pop();

  let replies: CommentRow[] = [];
  if (top.length) {
    const ids = top.map((t) => t.id);
    replies = (
      await c.env.DB.prepare(
        `SELECT ${COLS} FROM comments WHERE root_id IN (${ids.map(() => '?').join(',')}) AND status = 'visible' ORDER BY id ASC LIMIT 1000`,
      ).bind(...ids).all<CommentRow>()
    ).results;
  }

  const voter = await voterHashOf(c.env, c.req.raw, site.id);
  const myVotes = new Map<number, number>();
  const vr = await c.env.DB.prepare(
    'SELECT v.comment_id, v.value FROM votes v JOIN comments c ON c.id = v.comment_id WHERE v.voter_hash = ? AND c.page_id = ?',
  ).bind(voter, page.id).all<{ comment_id: number; value: number }>();
  for (const r of vr.results) myVotes.set(r.comment_id, r.value);

  const last = top[top.length - 1];
  const nextCursor = hasMore && last ? (sort === 'hot' ? offset + limit : last.id) : null;
  return json(
    c,
    { comments: [...top, ...replies].map((r) => toPublic(r, myVotes.get(r.id) ?? 0)), total: page.comment_count, next_cursor: nextCursor, config: cfg },
    200,
    origin,
    hdr,
  );
});

// ---------- 发表评论 ----------

async function readJson(c: Ctx): Promise<Record<string, any> | null> {
  try {
    const b = await c.req.json();
    return b && typeof b === 'object' ? (b as Record<string, any>) : null;
  } catch {
    return null;
  }
}

publicRoutes.post('/api/comments', async (c) => {
  const body = await readJson(c);
  if (!body) return fail(c, 400, 'bad_json');
  const g = await guard(c, body.site);
  if (g instanceof Response) return g;
  const { site, origin } = g;
  const env = c.env;
  const st = site.settings;

  const ipHash = await ipHashOf(env, c.req.raw);

  const nickname = sanitizeNickname(body.nickname);
  const content = sanitizeText(body.content, st.maxLength);
  const email = sanitizeEmail(body.email);
  if (!nickname) return fail(c, 400, 'nickname_required');
  if (!content) return fail(c, 400, 'content_required');

  const key = pageKeyFor(body.page_id, body.url, st);
  if (!key) return fail(c, 400, 'bad_url');

  // 父评论
  let parentId: number | null = null;
  let rootId: number | null = null;
  let parentRow: { id: number; root_id: number | null; page_id: number; status: string } | null = null;
  if (body.parent_id != null) {
    parentId = Math.floor(Number(body.parent_id));
    parentRow = await env.DB.prepare('SELECT id, root_id, page_id, status FROM comments WHERE id = ? AND site_id = ?').bind(parentId, site.id).first();
    if (!parentRow || parentRow.status !== 'visible') return fail(c, 400, 'bad_parent');
    rootId = parentRow.root_id ?? parentRow.id;
  }

  // 待核查：外链过多或命中黑名单
  const flagged = countLinks(content) > st.maxLinks || containsBlacklisted(content + ' ' + nickname, st.blacklist) ? 1 : 0;

  // 页面（url 只在属于站点域名时才保存，避免邮件里出现钓鱼链接）
  const title = sanitizeLine(body.title, 200) || null;
  const pageUrl = typeof body.url === 'string' && urlHostAllowed(body.url, site.domains) ? body.url.slice(0, 1000) : null;
  const pageRow = await env.DB.prepare(
    `INSERT INTO pages (site_id, page_key, title, url) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(site_id, page_key) DO UPDATE SET title = COALESCE(?3, title), url = COALESCE(?4, url)
     RETURNING id`,
  ).bind(site.id, key, title, pageUrl).first<{ id: number }>();
  const pageId = pageRow!.id;
  if (parentRow && parentRow.page_id !== pageId) return fail(c, 400, 'bad_parent');

  const emailHash = email ? (await sha256Hex(`email:${env.IP_SALT}:${email}`)) : await sha256Hex(`anon:${env.IP_SALT}:${nickname}`);
  const ts = now();
  const ins = await env.DB.prepare(
    `INSERT INTO comments (page_id, site_id, parent_id, root_id, nickname, email, email_hash, content, status, ip_hash, created_at, flagged)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'visible', ?, ?, ?) RETURNING ${COLS}`,
  ).bind(pageId, site.id, parentId, rootId, nickname, email || null, emailHash, content, ipHash, ts, flagged).first<CommentRow>();
  await recountPages(env.DB, [pageId]);

  return json(c, { comment: toPublic(ins!), flagged: flagged === 1 }, 201, origin);
});
