// 内容净化：存储前去除所有 HTML；展示端一律 textContent / escapeHtml。

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g;

/** 去除所有 HTML 标签（含 script/style 内容、注释、不完整标签）与控制字符。 */
export function stripHtml(input: string): string {
  let s = String(input ?? '');
  s = s.replace(/<!--[\s\S]*?(-->|$)/g, '');
  s = s.replace(/<\s*(script|style|iframe|object|embed|noscript|template)\b[\s\S]*?(<\s*\/\s*\1\s*>|$)/gi, '');
  // 反复剥离直到稳定，防止 "<scr<b>ipt>" 之类的拼接绕过
  let prev: string;
  do {
    prev = s;
    s = s.replace(/<\/?[a-zA-Z!?][^>]*(>|$)/g, '');
  } while (s !== prev);
  // 残留的孤立尖括号直接移除：存储里不留下任何可被解析为标签的字符
  s = s.replace(/[<>]/g, '');
  return s.replace(CONTROL, '');
}

export function sanitizeText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  let s = stripHtml(input).replace(/\r\n?/g, '\n');
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

export function sanitizeNickname(input: unknown): string {
  if (typeof input !== 'string') return '';
  return stripHtml(input).replace(/\s+/g, ' ').trim().slice(0, 40);
}

export function sanitizeLine(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  return stripHtml(input).replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const LINK_RE = /(https?:\/\/|www\.)[^\s]+/gi;

export function countLinks(text: string): number {
  return (text.match(LINK_RE) ?? []).length;
}

export function containsBlacklisted(text: string, words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((w) => w && lower.includes(w.toLowerCase()));
}

const EMAIL_RE = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,255}\.[^\s@<>"',;]{2,}$/;
export function sanitizeEmail(input: unknown): string {
  if (typeof input !== 'string') return '';
  const e = input.trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : '';
}

/** 供 SSR 渲染：把纯文本转成带 nofollow ugc 的段落 HTML，所有内容先转义。 */
export function textToSafeHtml(text: string): string {
  const escaped = escapeHtml(text);
  const linked = escaped.replace(/(https?:\/\/[^\s<]+)/gi, (m) => {
    // m 已转义；剥掉末尾标点
    const trail = m.match(/[.,;:!?)\]&#;]*$/)?.[0] ?? '';
    const href = m.slice(0, m.length - trail.length);
    return `<a href="${href}" rel="nofollow ugc noopener" target="_blank">${href}</a>${trail}`;
  });
  return linked.replace(/\n/g, '<br>');
}
