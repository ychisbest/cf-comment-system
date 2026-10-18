import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { getSite, publicBase } from '../lib/site';
import { pageKeyFor } from '../lib/url';
import { escapeHtml, textToSafeHtml } from '../lib/sanitize';
import { now } from '../lib/db';

export const ssrRoutes = new Hono<AppEnv>();

interface Row {
  id: number;
  parent_id: number | null;
  root_id: number | null;
  nickname: string;
  content: string;
  image_key: string | null;
  likes: number;
  created_at: number;
}

interface Node extends Row {
  replies: Node[];
}

const iso = (ts: number) => new Date(ts * 1000).toISOString();

/** JSON 放进 <script> 前转义，避免 </script> 或行分隔符截断。 */
export function safeJsonForScript(o: unknown): string {
  return JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function buildTree(rows: Row[]): Node[] {
  const byId = new Map<number, Node>(rows.map((r) => [r.id, { ...r, replies: [] }]));
  const tops: Node[] = [];
  for (const n of byId.values()) {
    if (n.parent_id == null) tops.push(n);
    else {
      // 父评论不在可展示集合中时，挂到楼主下
      const parent = byId.get(n.parent_id) ?? (n.root_id != null ? byId.get(n.root_id) : undefined);
      if (parent) parent.replies.push(n);
    }
  }
  return tops;
}

function renderNode(n: Node, base: string): string {
  const img = n.image_key
    ? `<img src="${escapeHtml(`${base}/img/${n.image_key}`)}" alt="${escapeHtml('Image attached by ' + n.nickname)}" loading="lazy">`
    : '';
  const replies = n.replies.length ? `<div class="cm-ssr-replies">${n.replies.map((r) => renderNode(r, base)).join('')}</div>` : '';
  return (
    `<article id="cm-ssr-${n.id}" class="cm-ssr-comment"><header><b>${escapeHtml(n.nickname)}</b> ` +
    `<time datetime="${iso(n.created_at)}">${iso(n.created_at).slice(0, 10)}</time></header>` +
    `<p>${textToSafeHtml(n.content)}</p>${img}${replies}</article>`
  );
}

function ldNode(n: Node, base: string): Record<string, unknown> {
  const o: Record<string, unknown> = {
    '@type': 'Comment',
    author: { '@type': 'Person', name: n.nickname },
    dateCreated: iso(n.created_at),
    text: n.content,
    upvoteCount: n.likes,
  };
  if (n.image_key) o.image = `${base}/img/${n.image_key}`;
  if (n.replies.length) o.comment = n.replies.map((r) => ldNode(r, base));
  return o;
}

ssrRoutes.get('/ssr', async (c) => {
  const q = c.req.query();
  const format = q.format === 'json' ? 'json' : 'html';
  const site = await getSite(c.env.DB, q.site);
  if (!site) return c.json({ error: 'unknown_site' }, 404);
  const key = pageKeyFor(q.page_id, q.url, site.settings);
  if (!key) return c.json({ error: 'bad_url' }, 400);

  const headers: Record<string, string> = {
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    'X-Content-Type-Options': 'nosniff',
    'Content-Type': format === 'json' ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
  };
  const st = site.settings;
  const empty = () => new Response(format === 'json' ? JSON.stringify({ comments: [], count: 0, json_ld: null }) : '', { headers });
  if (!st.ssrEnabled) return empty();

  const page = await c.env.DB.prepare('SELECT id, title, url FROM pages WHERE site_id = ? AND page_key = ?').bind(site.id, key).first<{ id: number; title: string | null; url: string | null }>();
  if (!page) return empty();

  // 可进入 SSR 的评论：可见，且（站长已人工通过，或 未被标记且已过延迟期）
  const cutoff = now() - st.ssrDelayHours * 3600;
  const ELIGIBLE = "status = 'visible' AND (flagged = 2 OR (flagged = 0 AND created_at <= ?))";
  const cols = 'id, parent_id, root_id, nickname, content, image_key, likes, created_at';
  const rows = (
    await c.env.DB.prepare(
      `SELECT ${cols} FROM comments WHERE page_id = ?1 AND ${ELIGIBLE.replace('?', '?2')} AND
         (id IN (SELECT id FROM comments WHERE page_id = ?1 AND parent_id IS NULL AND ${ELIGIBLE.replace('?', '?2')} ORDER BY id LIMIT ?3)
          OR root_id IN (SELECT id FROM comments WHERE page_id = ?1 AND parent_id IS NULL AND ${ELIGIBLE.replace('?', '?2')} ORDER BY id LIMIT ?3))
       ORDER BY id LIMIT 2000`,
    ).bind(page.id, cutoff, st.ssrMaxComments).all<Row>()
  ).results;

  const base = publicBase(c.env, c.req.raw);
  const tree = buildTree(rows);
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    ...(page.url ? { url: page.url } : {}),
    ...(page.title ? { name: page.title } : {}),
    commentCount: rows.length,
    comment: tree.map((n) => ldNode(n, base)),
  };

  if (format === 'json') return new Response(JSON.stringify({ count: rows.length, comments: tree, json_ld: ld }), { headers });
  if (!rows.length) return empty();
  const html =
    `<section class="cm-ssr" aria-label="Comments"><h2>Comments (${rows.length})</h2>${tree.map((n) => renderNode(n, base)).join('')}</section>` +
    `<script type="application/ld+json">${safeJsonForScript(ld)}</script>`;
  return new Response(html, { headers });
});
