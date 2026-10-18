import type { Env } from './types';
import { now } from './lib/db';
import { processQueue } from './lib/email';

/** 清理：24 小时未被引用的上传、过期的限流计数。 */
export async function cleanup(env: Env): Promise<{ uploads: number; rate: number }> {
  await processQueue(env).catch((e) => console.error('email queue', e));
  const cutoff = now() - 24 * 3600;
  const orphans = (await env.DB.prepare('SELECT key FROM uploads WHERE comment_id IS NULL AND created_at < ? LIMIT 200').bind(cutoff).all<{ key: string }>()).results;
  if (orphans.length) {
    await env.BUCKET.delete(orphans.map((o) => o.key));
    await env.DB.batch(orphans.map((o) => env.DB.prepare('DELETE FROM uploads WHERE key = ? AND comment_id IS NULL').bind(o.key)));
  }
  const rate = await env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(now()).run();
  return { uploads: orphans.length, rate: rate.meta.changes ?? 0 };
}
