import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectImageType, IMAGE_KEY_RE, makeImageKey } from '../src/lib/image';
import { verifyTurnstile } from '../src/lib/turnstile';

const pad = (a: number[]) => new Uint8Array([...a, ...new Array(32).fill(0)]);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe('detectImageType 魔数校验', () => {
  it('识别 JPEG/PNG/GIF/WebP', () => {
    expect(detectImageType(pad([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe('image/jpeg');
    expect(detectImageType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mime).toBe('image/png');
    expect(detectImageType(pad(ascii('GIF89a')))?.mime).toBe('image/gif');
    expect(detectImageType(pad(ascii('GIF87a')))?.ext).toBe('gif');
    expect(detectImageType(pad([...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBP')]))?.mime).toBe('image/webp');
  });
  it('拒绝 SVG / HTML / 改后缀文件 / 过短', () => {
    expect(detectImageType(pad(ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>')))).toBeNull();
    expect(detectImageType(pad(ascii('<?xml version="1.0"?><svg>')))).toBeNull();
    expect(detectImageType(pad(ascii('<html><script>alert(1)</script>')))).toBeNull();
    expect(detectImageType(pad(ascii('RIFF....WAVE')))).toBeNull(); // RIFF 但不是 WebP
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
    expect(detectImageType(new Uint8Array(0))).toBeNull();
  });
});

describe('image key', () => {
  it('生成的 key 符合格式且不含用户输入', () => {
    const k = makeImageKey('site_abc', 'webp', new Date(Date.UTC(2026, 2, 5)));
    expect(k).toMatch(/^uploads\/site_abc\/202603\/[0-9a-f-]{36}\.webp$/);
    expect(IMAGE_KEY_RE.test(k)).toBe(true);
    expect(IMAGE_KEY_RE.test('uploads/site_abc/202603/../../x.webp')).toBe(false);
    expect(IMAGE_KEY_RE.test('uploads/site_abc/202603/' + 'a'.repeat(36) + '.svg')).toBe(false);
  });
});

describe('verifyTurnstile', () => {
  afterEach(() => vi.unstubAllGlobals());
  const env: any = { TURNSTILE_SECRET: 's' };
  it('success=true 才通过；缺 token、HTTP 错误、异常都失败', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true }))));
    expect(await verifyTurnstile(env, 'tok', '1.1.1.1')).toBe(true);
    expect(await verifyTurnstile(env, '', '1.1.1.1')).toBe(false);
    expect(await verifyTurnstile(env, undefined, '1.1.1.1')).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false }))));
    expect(await verifyTurnstile(env, 'tok', 'x')).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('err', { status: 500 })));
    expect(await verifyTurnstile(env, 'tok', 'x')).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('net'); }));
    expect(await verifyTurnstile(env, 'tok', 'x')).toBe(false);
  });
});
