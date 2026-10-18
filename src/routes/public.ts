import { Hono, type Context } from 'hono';
import type { AppEnv, Site } from '../types';
import { getSite, originAllowed, urlHostAllowed, ipHashOf, voterHashOf } from '../lib/site';
import { pageKeyFor } from '../lib/url';
import { sanitizeText, sanitizeNickname, sanitizeLine, sanitizeEmail, countLinks, containsBlacklisted } from '../lib/sanitize';
import { sha256Hex } from '../lib/hash';
import { now, recountPages } from '../lib/db';
import { checkRateLimit, d1Store, parseRules } from '../lib/ratelimit';
import { verifyTurnstile } from '../lib/turnstile';
import { clientIp } from '../lib/site';
import { detectImageType, makeImageKey, IMAGE_KEY_RE, EXT_MIME, MAX_UPLOAD_BYTES } from '../lib/image';

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

/** 封禁 + 限流；通过返回 null，否则返回响应。 */
async function abuseGate(c: Ctx, site: Site, ipHash: string, scope: 'comment' | 'upload' | 'vote'): Promise<Response | null> {
  const ban = await c.env.DB.prepare('SELECT 1 FROM bans WHERE ip_hash = ? AND (site_id IS NULL OR site_id = ?) LIMIT 1').bind(ipHash, site.id).first();
  if (ban) return fail(c, 403, 'banned');
  const spec = { comment: c.env.RATE_COMMENT, upload: c.env.RATE_UPLOAD, vote: c.env.RATE_VOTE }[scope];
  const dflt = { comment: '3/20/100', upload: '3/20/50', vote: '20/200/1000' }[scope];
  const r = await checkRateLimit(d1Store(c.env.DB), scope, ipHash, parseRules(spec, dflt), now());
  if (!r.ok) return fail(c, 429, 'rate_limited', { 'Retry-After': String(r.retryAfter) });
  return null;
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
  const gate = await abuseGate(c, site, ipHash, 'comment');
  if (gate) return gate;

  const nickname = sanitizeNickname(body.nickname);
  const content = sanitizeText(body.content, st.maxLength);
  const email = sanitizeEmail(body.email);
  if (!nickname) return fail(c, 400, 'nickname_required');
  if (!content) return fail(c, 400, 'content_required');

  const key = pageKeyFor(body.page_id, body.url, st);
  if (!key) return fail(c, 400, 'bad_url');

  // 图片：必须是本站点、尚未被引用的已上传对象
  let imageKey: string | null = null;
  if (body.image_key != null && body.image_key !== '') {
    if (!st.allowImages || typeof body.image_key !== 'string' || !IMAGE_KEY_RE.test(body.image_key)) return fail(c, 400, 'bad_image');
    const up = await env.DB.prepare('SELECT key FROM uploads WHERE key = ? AND site_id = ? AND comment_id IS NULL').bind(body.image_key, site.id).first();
    if (!up) return fail(c, 400, 'bad_image');
    imageKey = body.image_key;
  }

  // 重复内容：同一 IP 或同一页面 10 分钟内相同内容
  const dup = await env.DB.prepare(
    `SELECT 1 FROM comments WHERE content = ?1 AND created_at > ?2 AND (ip_hash = ?3 OR site_id = ?4) LIMIT 1`,
  ).bind(content, now() - 600, ipHash, site.id).first();
  if (dup) return fail(c, 409, 'duplicate_content');

  // Turnstile（服务端校验，校验放在所有廉价检查之后以免浪费 token）
  if (!(await verifyTurnstile(env, body.token, clientIp(c.req.raw)))) return fail(c, 403, 'turnstile_failed');

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
    `INSERT INTO comments (page_id, site_id, parent_id, root_id, nickname, email, email_hash, content, image_key, status, ip_hash, created_at, flagged)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'visible', ?, ?, ?) RETURNING ${COLS}`,
  ).bind(pageId, site.id, parentId, rootId, nickname, email || null, emailHash, content, imageKey, ipHash, ts, flagged).first<CommentRow>();
  await recountPages(env.DB, [pageId]);
  if (imageKey) await env.DB.prepare('UPDATE uploads SET comment_id = ? WHERE key = ?').bind(ins!.id, imageKey).run();

  return json(c, { comment: toPublic(ins!), flagged: flagged === 1 }, 201, origin);
});

// ---------- 点赞 / 点踩 ----------

publicRoutes.post('/api/vote', async (c) => {
  const body = await readJson(c);
  if (!body) return fail(c, 400, 'bad_json');
  const g = await guard(c, body.site);
  if (g instanceof Response) return g;
  const { site, origin } = g;
  const value = body.value === 1 ? 1 : body.value === -1 ? -1 : 0;
  const commentId = Math.floor(Number(body.comment_id));
  if (!value || !Number.isFinite(commentId)) return fail(c, 400, 'bad_request');
  const gate = await abuseGate(c, site, await ipHashOf(c.env, c.req.raw), 'vote');
  if (gate) return gate;

  const comment = await c.env.DB.prepare("SELECT id FROM comments WHERE id = ? AND site_id = ? AND status = 'visible'").bind(commentId, site.id).first();
  if (!comment) return fail(c, 404, 'not_found');

  const voter = await voterHashOf(c.env, c.req.raw, site.id);
  const cur = await c.env.DB.prepare('SELECT value FROM votes WHERE comment_id = ? AND voter_hash = ?').bind(commentId, voter).first<{ value: number }>();
  let mine: number = value;
  const stmts: D1PreparedStatement[] = [];
  if (!cur) stmts.push(c.env.DB.prepare('INSERT OR IGNORE INTO votes (comment_id, voter_hash, value) VALUES (?, ?, ?)').bind(commentId, voter, value));
  else if (cur.value === value) { // 再次点击同值：取消
    mine = 0;
    stmts.push(c.env.DB.prepare('DELETE FROM votes WHERE comment_id = ? AND voter_hash = ?').bind(commentId, voter));
  } else stmts.push(c.env.DB.prepare('UPDATE votes SET value = ? WHERE comment_id = ? AND voter_hash = ?').bind(value, commentId, voter));
  // 计数始终由 votes 表重新统计，保证"每个 voter 一票"且并发下也准确
  stmts.push(
    c.env.DB.prepare(
      `UPDATE comments SET likes = (SELECT COUNT(*) FROM votes WHERE comment_id = ?1 AND value = 1),
                           dislikes = (SELECT COUNT(*) FROM votes WHERE comment_id = ?1 AND value = -1) WHERE id = ?1`,
    ).bind(commentId),
  );
  await c.env.DB.batch(stmts);
  const row = await c.env.DB.prepare('SELECT likes, dislikes FROM comments WHERE id = ?').bind(commentId).first<{ likes: number; dislikes: number }>();
  return json(c, { likes: row!.likes, dislikes: row!.dislikes, my_vote: mine }, 200, origin);
});

// ---------- 图片上传 ----------

publicRoutes.post('/api/upload', async (c) => {
  const origin = c.req.header('Origin') ?? null;
  // 先看 Content-Length，避免读取超大请求体（multipart 有少量开销）
  const len = Number(c.req.header('Content-Length') ?? '0');
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) return fail(c, 413, 'too_large');
  let fd: FormData;
  try {
    fd = await c.req.formData();
  } catch {
    return fail(c, 400, 'bad_form');
  }
  const g = await guard(c, fd.get('site'));
  if (g instanceof Response) return g;
  const { site } = g;
  if (!site.settings.allowImages) return fail(c, 403, 'images_disabled');

  const ipHash = await ipHashOf(c.env, c.req.raw);
  const gate = await abuseGate(c, site, ipHash, 'upload');
  if (gate) return gate;

  const file = fd.get('file');
  if (!file || typeof file === 'string') return fail(c, 400, 'file_required');
  const f = file as unknown as File;
  if (f.size > MAX_UPLOAD_BYTES) return fail(c, 413, 'too_large');
  const bytes = new Uint8Array(await f.arrayBuffer());
  if (bytes.length > MAX_UPLOAD_BYTES) return fail(c, 413, 'too_large');
  const type = detectImageType(bytes); // 只看魔数，忽略 Content-Type / 文件名
  if (!type) return fail(c, 415, 'unsupported_image');

  if (!(await verifyTurnstile(c.env, fd.get('token'), clientIp(c.req.raw)))) return fail(c, 403, 'turnstile_failed');

  const key = makeImageKey(site.id, type.ext);
  await c.env.BUCKET.put(key, bytes, { httpMetadata: { contentType: type.mime } });
  await c.env.DB.prepare('INSERT INTO uploads (key, site_id, ip_hash, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(key, site.id, ipHash, type.mime, bytes.length, now()).run();
  return json(c, { image_key: key }, 201, origin);
});

// ---------- 图片读取 ----------

publicRoutes.get('/img/*', async (c) => {
  const key = decodeURIComponent(c.req.path.slice('/img/'.length));
  if (!IMAGE_KEY_RE.test(key)) return c.text('not found', 404);
  const obj = await c.env.BUCKET.get(key);
  if (!obj) return c.text('not found', 404);
  // Content-Type 由扩展名（上传时按魔数确定）推出，而不是客户端提供的值
  const mime = EXT_MIME[key.split('.').pop()!] ?? 'application/octet-stream';
  return new Response(obj.body, {
    headers: {
      'Content-Type': mime,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      ETag: obj.httpEtag,
    },
  });
});
