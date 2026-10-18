import { describe, it, expect } from 'vitest';
import { checkRateLimit, parseRules, type CounterStore } from '../src/lib/ratelimit';

const memStore = (): CounterStore => {
  const m = new Map<string, number>();
  return { async incr(k) { m.set(k, (m.get(k) ?? 0) + 1); return m.get(k)!; } };
};

describe('parseRules', () => {
  it('解析 分/时/天', () => {
    expect(parseRules('3/20/100', '1/1/1').map((r) => [r.window, r.max])).toEqual([[60, 3], [3600, 20], [86400, 100]]);
  });
  it('无效值回落默认', () => {
    expect(parseRules('abc', '5/6/7')[2].max).toBe(7);
    expect(parseRules(undefined, '5/6/7')[0].max).toBe(5);
    expect(parseRules('0/1/1', '5/6/7')[0].max).toBe(5);
  });
});

describe('checkRateLimit', () => {
  const rules = parseRules('3/10/20', '1/1/1');
  it('分钟窗口超限 → 拒绝并给出 retryAfter', async () => {
    const s = memStore();
    const t = 1_000_000 * 60 + 10; // 窗口内第 10 秒
    for (let i = 0; i < 3; i++) expect((await checkRateLimit(s, 'c', 'ip1', rules, t)).ok).toBe(true);
    const r = await checkRateLimit(s, 'c', 'ip1', rules, t);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBe(50);
  });
  it('不同 ip / scope 互不影响', async () => {
    const s = memStore();
    for (let i = 0; i < 4; i++) await checkRateLimit(s, 'c', 'ip1', rules, 100);
    expect((await checkRateLimit(s, 'c', 'ip2', rules, 100)).ok).toBe(true);
    expect((await checkRateLimit(s, 'u', 'ip1', rules, 100)).ok).toBe(true);
  });
  it('下一窗口恢复；小时上限仍累计', async () => {
    const s = memStore();
    let t = 3600 * 5;
    let okCount = 0;
    for (let i = 0; i < 20; i++) { t += 61; if ((await checkRateLimit(s, 'c', 'ip', rules, t)).ok) okCount++; }
    // 每分钟窗口都是新的，被小时上限(10)截断；之后 retryAfter 指向小时窗口结束
    expect(okCount).toBe(10);
  });
});
