import { describe, it, expect } from 'vitest';
import { normalizeUrl, pageKeyFor, resolvePageUrl } from '../src/lib/url';

describe('normalizeUrl', () => {
  it('小写主机、去 www、去 hash、去末尾斜杠', () => {
    expect(normalizeUrl('HTTPS://WWW.Example.com/Post/#top')).toBe('example.com/Post');
    expect(normalizeUrl('https://example.com/')).toBe('example.com/');
    expect(normalizeUrl('https://example.com')).toBe('example.com/');
  });
  it('http 与 https 同一页面；保留非默认端口', () => {
    expect(normalizeUrl('http://example.com/a')).toBe(normalizeUrl('https://example.com/a'));
    expect(normalizeUrl('http://example.com:8080/a')).toBe('example.com:8080/a');
    expect(normalizeUrl('https://example.com:443/a')).toBe('example.com/a');
  });
  it('删除跟踪参数，其余按字母排序保留', () => {
    expect(normalizeUrl('https://e.com/p?utm_source=x&b=2&a=1&fbclid=z&gclid=1&ref=t&spm=q')).toBe('e.com/p?a=1&b=2');
    expect(normalizeUrl('https://e.com/p?utm_medium=a')).toBe('e.com/p');
  });
  it('换 utm 参数得到同一 key', () => {
    expect(normalizeUrl('https://e.com/p?id=3&utm_campaign=a')).toBe(normalizeUrl('https://e.com/p?utm_campaign=b&id=3#x'));
  });
  it('queryMode=drop 丢弃所有查询参数', () => {
    expect(normalizeUrl('https://e.com/p?id=3', { queryMode: 'drop' })).toBe('e.com/p');
  });
  it('stripWww=false 保留 www', () => {
    expect(normalizeUrl('https://www.e.com/p', { stripWww: false })).toBe('www.e.com/p');
  });
  it('合并重复斜杠；非 http(s)/非法返回 null', () => {
    expect(normalizeUrl('https://e.com//a//b/')).toBe('e.com/a/b');
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('not a url')).toBeNull();
  });
  it('幂等', () => {
    const n = normalizeUrl('https://www.E.com/a/?z=1&a=2&utm_x=1#h')!;
    expect(normalizeUrl('https://' + n, { stripWww: true })).toBe(n);
  });
  it('相对 URL 使用 base', () => {
    expect(normalizeUrl('/x?b=1', {}, 'https://e.com/y')).toBe('e.com/x?b=1');
  });
});

describe('pageKeyFor', () => {
  it('data-page-id 优先', () => {
    expect(pageKeyFor('post-42', 'https://e.com/a')).toBe('id:post-42');
  });
  it('否则用规范化 URL', () => {
    expect(pageKeyFor('', 'https://e.com/a?utm_x=1')).toBe('e.com/a');
    expect(pageKeyFor(undefined, undefined)).toBeNull();
  });
});

describe('resolvePageUrl (canonical)', () => {
  it('canonical 优先，相对路径基于当前地址', () => {
    expect(resolvePageUrl('/canon', 'https://e.com/x?utm=1')).toBe('https://e.com/canon');
    expect(resolvePageUrl(null, 'https://e.com/x')).toBe('https://e.com/x');
    expect(resolvePageUrl('javascript:1', 'https://e.com/x')).toBe('https://e.com/x');
  });
});
