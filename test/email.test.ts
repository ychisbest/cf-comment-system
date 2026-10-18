import { describe, it, expect } from 'vitest';
import { buildMail } from '../src/lib/email';

describe('buildMail', () => {
  const unsub = 'https://c.example.com/api/unsubscribe?token=abc';
  it('转义用户内容，包含摘要、评论链接、退订链接', () => {
    const m = buildMail('a@b.com', 'My <b>Post</b>', 'https://e.com/p', [{ id: 7, nickname: '<script>x</script>', content: '<img src=x onerror=1> hi' }], unsub);
    expect(m.html).not.toContain('<script>');
    expect(m.html).not.toContain('<img');
    expect(m.html).toContain('&lt;script&gt;');
    expect(m.html).toContain('https://e.com/p#cm-7');
    expect(m.html).toContain(unsub);
    expect(m.text).toContain(unsub);
  });
  it('主题不含换行（防头注入）；长内容被截断；多条合并', () => {
    const m = buildMail('a@b.com', 'T', null, [{ id: 1, nickname: 'x\r\nBcc: evil@x.com', content: 'y'.repeat(500) }], unsub);
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.text.length).toBeLessThan(500);
    expect(m.html).not.toContain('View comment');
    const many = buildMail('a@b.com', 'T', 'https://e.com/p#old', [{ id: 1, nickname: 'a', content: 'x' }, { id: 2, nickname: 'b', content: 'y' }], unsub);
    expect(many.subject).toContain('2 new replies');
    expect(many.text).toContain('https://e.com/p#cm-2');
  });
});
