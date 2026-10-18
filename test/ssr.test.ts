import { describe, it, expect } from 'vitest';
import { safeJsonForScript } from '../src/routes/ssr';

describe('safeJsonForScript', () => {
  it('不能被 </script> 截断，且仍是合法 JSON', () => {
    const o = { text: '</script><script>alert(1)</script> &  ' };
    const s = safeJsonForScript(o);
    expect(s).not.toContain('<');
    expect(s).not.toContain('>');
    expect(JSON.parse(s)).toEqual(o);
  });
});
