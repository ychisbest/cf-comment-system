import type { Env } from '../types';
import { escapeHtml } from './sanitize';
import { now } from './db';
import { randomToken } from './hash';
import { urlHostAllowed, rowToSite } from './site';

const RESEND_URL = 'https://api.resend.com/emails';
export const THROTTLE_SECONDS = 600; // 同一订阅者对同一页面每 10 分钟最多一封
const MAX_ATTEMPTS = 20;

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string;
}

export async function sendMail(env: Env, m: Mail): Promise<boolean> {
  try {
    const res = await fetch(env.RESEND_API_URL || RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [m.to],
        subject: m.subject,
        html: m.html,
        text: m.text,
        headers: { 'List-Unsubscribe': `<${m.unsubscribeUrl}>` },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const excerpt = (s: string, n = 200) => (s.length > n ? s.slice(0, n) + '…' : s);
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ');

interface ReplyInfo { id: number; nickname: string; content: string; }

/** 把一个或多个回复合并成一封邮件。所有用户内容都做 HTML 转义。 */
export function buildMail(to: string, pageTitle: string, pageUrl: string | null, replies: ReplyInfo[], unsubscribeUrl: string): Mail {
  const title = oneLine(pageTitle || pageUrl || 'a page').slice(0, 120);
  const subject = replies.length > 1 ? `${replies.length} new replies on "${title}"` : `${oneLine(replies[0].nickname)} replied to your comment`;
  const link = (id: number) => (pageUrl ? `${pageUrl.split('#')[0]}#cm-${id}` : null);
  const htmlItems = replies
    .map((r) => {
      const l = link(r.id);
      return `<blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #ccc"><b>${escapeHtml(r.nickname)}</b><br>${escapeHtml(excerpt(r.content)).replace(/\n/g, '<br>')}${l ? `<br><a href="${escapeHtml(l)}">View comment</a>` : ''}</blockquote>`;
    })
    .join('');
  const html = `<div style="font-family:sans-serif;max-width:560px"><p>New ${replies.length > 1 ? 'replies' : 'reply'} on <b>${escapeHtml(title)}</b>:</p>${htmlItems}<p style="color:#888;font-size:12px">Don't want these emails? <a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a></p></div>`;
  const text =
    `New ${replies.length > 1 ? 'replies' : 'reply'} on "${title}":\n\n` +
    replies.map((r) => `${oneLine(r.nickname)}: ${excerpt(r.content)}${link(r.id) ? `\n${link(r.id)}` : ''}`).join('\n\n') +
    `\n\nUnsubscribe: ${unsubscribeUrl}\n`;
  return { to, subject, html, text, unsubscribeUrl };
}

// ---------- 订阅 ----------

export async function subscribe(db: D1Database, commentId: number, email: string): Promise<void> {
  await db.prepare('INSERT INTO subscriptions (comment_id, email, unsubscribe_token, created_at) VALUES (?, ?, ?, ?)').bind(commentId, email, randomToken(24), now()).run();
}

const dayKey = () => `emailday:${Math.floor(now() / 86400)}`;

async function dailyBudgetLeft(env: Env): Promise<boolean> {
  const limit = Number(env.EMAIL_DAILY_LIMIT) || 90;
  const r = await env.DB.prepare('SELECT count FROM rate_limits WHERE key = ?').bind(dayKey()).first<{ count: number }>();
  return (r?.count ?? 0) < limit;
}
async function spendBudget(env: Env): Promise<void> {
  await env.DB.prepare('INSERT INTO rate_limits (key, count, expires_at) VALUES (?1, 1, ?2) ON CONFLICT(key) DO UPDATE SET count = count + 1').bind(dayKey(), now() + 2 * 86400).run();
}

const baseUrl = (env: Env) => env.PUBLIC_BASE_URL.replace(/\/$/, '');

/** 发送给 (email, page) 的一组回复；返回是否成功。 */
async function deliver(env: Env, email: string, pageId: number, replyIds: number[]): Promise<'sent' | 'skipped' | 'failed'> {
  const page = await env.DB.prepare('SELECT p.title, p.url, s.domains, s.settings, s.id AS sid, s.name, s.custom_css, s.created_at FROM pages p JOIN sites s ON s.id = p.site_id WHERE p.id = ?').bind(pageId).first<any>();
  if (!page) return 'skipped';
  const ph = replyIds.map(() => '?').join(',');
  const replies = (
    await env.DB.prepare(`SELECT id, nickname, content FROM comments WHERE id IN (${ph}) AND status = 'visible' AND flagged != 1 ORDER BY id`).bind(...replyIds).all<ReplyInfo>()
  ).results;
  if (!replies.length) return 'skipped'; // 回复已被隐藏/删除/待核查
  const sub = await env.DB.prepare('SELECT unsubscribe_token FROM subscriptions WHERE email = ? ORDER BY id LIMIT 1').bind(email).first<{ unsubscribe_token: string }>();
  if (!sub) return 'skipped'; // 已退订
  const site = rowToSite({ id: page.sid, name: page.name, domains: page.domains, custom_css: page.custom_css, settings: page.settings, created_at: page.created_at });
  const url = page.url && urlHostAllowed(page.url, site.domains) ? page.url : null;
  const mail = buildMail(email, page.title ?? '', url, replies, `${baseUrl(env)}/api/unsubscribe?token=${sub.unsubscribe_token}`);
  await spendBudget(env);
  if (!(await sendMail(env, mail))) return 'failed';
  await env.DB.prepare('INSERT INTO notify_log (email, page_id, last_sent) VALUES (?1, ?2, ?3) ON CONFLICT(email, page_id) DO UPDATE SET last_sent = ?3').bind(email, pageId, now()).run();
  return 'sent';
}

async function enqueue(env: Env, email: string, pageId: number, replyId: number): Promise<void> {
  await env.DB.prepare('INSERT INTO email_queue (to_email, page_id, reply_id, created_at) VALUES (?, ?, ?, ?)').bind(email, pageId, replyId, now()).run();
}

/** 新回复发表后调用（放在 ctx.waitUntil 中）。任何失败都只会进入队列，不影响发表。 */
export async function notifyReply(env: Env, parentCommentId: number, reply: { id: number; page_id: number; email: string | null }): Promise<void> {
  try {
    const subs = (await env.DB.prepare('SELECT DISTINCT email FROM subscriptions WHERE comment_id = ?').bind(parentCommentId).all<{ email: string }>()).results;
    for (const { email } of subs) {
      if (reply.email && email === reply.email) continue; // 不通知自己
      const log = await env.DB.prepare('SELECT last_sent FROM notify_log WHERE email = ? AND page_id = ?').bind(email, reply.page_id).first<{ last_sent: number }>();
      const throttled = log && now() - log.last_sent < THROTTLE_SECONDS;
      const pending = await env.DB.prepare('SELECT 1 FROM email_queue WHERE to_email = ? AND page_id = ? LIMIT 1').bind(email, reply.page_id).first();
      if (throttled || pending || !(await dailyBudgetLeft(env))) { await enqueue(env, email, reply.page_id, reply.id); continue; }
      if ((await deliver(env, email, reply.page_id, [reply.id])) === 'failed') await enqueue(env, email, reply.page_id, reply.id);
    }
  } catch (e) {
    console.error('notifyReply failed', e);
  }
}

/** cron：按 (邮箱, 页面) 合并发送队列。 */
export async function processQueue(env: Env): Promise<{ sent: number; kept: number }> {
  let sent = 0;
  let kept = 0;
  const groups = (await env.DB.prepare('SELECT to_email, page_id FROM email_queue GROUP BY to_email, page_id ORDER BY MIN(id) LIMIT 50').all<{ to_email: string; page_id: number }>()).results;
  for (const g of groups) {
    const log = await env.DB.prepare('SELECT last_sent FROM notify_log WHERE email = ? AND page_id = ?').bind(g.to_email, g.page_id).first<{ last_sent: number }>();
    if (log && now() - log.last_sent < THROTTLE_SECONDS) { kept++; continue; }
    if (!(await dailyBudgetLeft(env))) { kept++; break; } // 超出日额度：留到下一周期
    const rows = (await env.DB.prepare('SELECT id, reply_id, attempts FROM email_queue WHERE to_email = ? AND page_id = ? ORDER BY id LIMIT 20').bind(g.to_email, g.page_id).all<{ id: number; reply_id: number; attempts: number }>()).results;
    const result = await deliver(env, g.to_email, g.page_id, rows.map((r) => r.reply_id));
    const ids = rows.map((r) => r.id);
    const ph = ids.map(() => '?').join(',');
    if (result === 'failed') {
      await env.DB.prepare(`UPDATE email_queue SET attempts = attempts + 1 WHERE id IN (${ph})`).bind(...ids).run();
      await env.DB.prepare('DELETE FROM email_queue WHERE attempts >= ?').bind(MAX_ATTEMPTS).run();
      kept++;
    } else {
      await env.DB.prepare(`DELETE FROM email_queue WHERE id IN (${ph})`).bind(...ids).run();
      if (result === 'sent') sent++;
    }
  }
  return { sent, kept };
}

/** 退订：删除该邮箱的全部订阅；返回是否命中 token。 */
export async function unsubscribe(db: D1Database, token: string): Promise<boolean> {
  if (!/^[0-9a-f]{48}$/.test(token)) return false;
  const sub = await db.prepare('SELECT email FROM subscriptions WHERE unsubscribe_token = ?').bind(token).first<{ email: string }>();
  if (!sub) return false;
  await db.batch([
    db.prepare('DELETE FROM subscriptions WHERE email = ?').bind(sub.email),
    db.prepare('DELETE FROM email_queue WHERE to_email = ?').bind(sub.email),
  ]);
  return true;
}
