import { describe, it, expect } from 'vitest';
import { stripHtml, sanitizeText, sanitizeNickname, countLinks, containsBlacklisted, sanitizeEmail, textToSafeHtml, escapeHtml } from '../src/lib/sanitize';
import { originAllowed } from '../src/lib/site';

describe('stripHtml / sanitize', () => {
  it('去除标签与 script 内容', () => {
    expect(stripHtml('hi <b>there</b>')).toBe('hi there');
    expect(stripHtml('a<script>alert(1)</script>b')).toBe('ab');
    expect(stripHtml('<img src=x onerror=alert(1)>ok')).toBe('ok');
    expect(stripHtml('x<!-- c -->y')).toBe('xy');
  });
  it('拼接绕过不能留下标签', () => {
    const out = stripHtml('<scr<script>ipt>alert(1)</scr</script>ipt>');
    expect(out).not.toMatch(/[<>]/);
    expect(stripHtml('<<b>b>img')).not.toMatch(/[<>]/);
  });
  it('不完整标签与孤立尖括号', () => {
    expect(stripHtml('1 < 2 > 0')).not.toMatch(/[<>]/);
    expect(stripHtml('<img src=x')).toBe('');
  });
  it('去除控制字符，保留换行，限制长度', () => {
    expect(sanitizeText('a\u0000b‮c\r\n\r\n\r\n\r\nd', 100)).toBe('abc\n\nd');
    expect(sanitizeText('x'.repeat(50), 10)).toHaveLength(10);
    expect(sanitizeText(123 as any, 10)).toBe('');
  });
  it('昵称同样处理并限长', () => {
    expect(sanitizeNickname('<b>Bob</b>  Lee')).toBe('Bob Lee');
    expect(sanitizeNickname('x'.repeat(100))).toHaveLength(40);
  });
  it('链接计数与黑名单', () => {
    expect(countLinks('see https://a.com and http://b.com or www.c.com')).toBe(3);
    expect(countLinks('no links')).toBe(0);
    expect(containsBlacklisted('Buy VIAGRA now', ['viagra'])).toBe(true);
    expect(containsBlacklisted('hello', ['viagra', ''])).toBe(false);
  });
  it('邮箱校验', () => {
    expect(sanitizeEmail(' A@B.com ')).toBe('a@b.com');
    expect(sanitizeEmail('bad')).toBe('');
    expect(sanitizeEmail('a@b.com\r\nBcc: x@y.com')).toBe('');
  });
  it('SSR 文本渲染：转义且链接带 rel', () => {
    const h = textToSafeHtml('<b>x</b> https://e.com/a?b=1&c=2.');
    expect(h).not.toContain('<b>');
    expect(h).toContain('rel="nofollow ugc noopener"');
    expect(h).toContain('href="https://e.com/a?b=1&amp;c=2"');
    expect(escapeHtml(`"'<>&`)).toBe('&quot;&#39;&lt;&gt;&amp;');
  });
});

describe('originAllowed', () => {
  const d = ['example.com', '*.blog.org', 'localhost:3000'];
  it('精确与通配', () => {
    expect(originAllowed('https://example.com', d)).toBe(true);
    expect(originAllowed('https://example.com:8443', d)).toBe(true);
    expect(originAllowed('https://a.blog.org', d)).toBe(true);
    expect(originAllowed('https://blog.org', d)).toBe(false);
    expect(originAllowed('https://evil-example.com', d)).toBe(false);
    expect(originAllowed('https://example.com.evil.com', d)).toBe(false);
    expect(originAllowed('http://localhost:3000', d)).toBe(true);
    expect(originAllowed('http://localhost:4000', d)).toBe(false);
  });
  it('缺失 / 非法 / 非 http', () => {
    expect(originAllowed(null, d)).toBe(false);
    expect(originAllowed('null', d)).toBe(false);
    expect(originAllowed('file://example.com', d)).toBe(false);
  });
});
