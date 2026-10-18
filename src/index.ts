import { Hono } from 'hono';
import type { AppEnv } from './types';
import { publicRoutes } from './routes/public';

const app = new Hono<AppEnv>();

app.route('/', publicRoutes);

// widget.js：强缓存（版本更新靠 URL 参数 / 短期 max-age + SWR）
app.get('/widget.js', async (c) => {
  const res = await c.env.ASSETS.fetch(new Request(new URL('/widget.js', c.req.url)));
  if (!res.ok) return c.text('widget not built', 404);
  const h = new Headers(res.headers);
  h.set('Content-Type', 'application/javascript; charset=utf-8');
  h.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  h.set('X-Content-Type-Options', 'nosniff');
  return new Response(res.body, { status: 200, headers: h });
});

app.get('/', (c) => c.text('cf-comment-system'));

app.onError((err, c) => {
  console.error('unhandled', err);
  return c.json({ error: 'internal_error' }, 500);
});

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<import('./types').Env>;
