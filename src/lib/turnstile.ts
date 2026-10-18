import type { Env } from '../types';

const DEFAULT_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** 服务端校验 Turnstile token。任何异常都视为失败（fail closed）。 */
export async function verifyTurnstile(env: Env, token: unknown, ip: string): Promise<boolean> {
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
    if (ip && ip !== 'local') body.set('remoteip', ip);
    const res = await fetch(env.TURNSTILE_VERIFY_URL || DEFAULT_URL, { method: 'POST', body });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
