// 方案 A：站点已在 Cloudflare 上时，用 HTMLRewriter 在边缘把评论 HTML 注入到 <div id="comments"> 内。
// 部署：给站点域名加路由（如 example.com/*），把 COMMENTS_ORIGIN 与 SITE_ID 换成自己的值。
// widget.js 加载后会接管（Shadow DOM 渲染），这里注入的内容保留在 light DOM 中供爬虫读取。

interface Env {
  COMMENTS_ORIGIN: string; // 评论 Worker 地址，如 https://comments.example.com
  SITE_ID: string; // 如 site_abc
  ORIGIN_URL?: string; // 仅本地演示：把请求转发到这个源站
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = env.ORIGIN_URL ? new Request(new URL(new URL(request.url).pathname + new URL(request.url).search, env.ORIGIN_URL), request) : request;
    const res = await fetch(origin);
    if (!res.headers.get('content-type')?.includes('text/html')) return res;

    // 先取片段（失败/超时则原样返回页面，不影响正常访问）
    let fragment = '';
    let pageId = '';
    return new HTMLRewriter()
      .on('div#comments', {
        async element(el) {
          pageId = el.getAttribute('data-page-id') ?? '';
          const u = new URL('/ssr', env.COMMENTS_ORIGIN);
          u.searchParams.set('site', env.SITE_ID);
          u.searchParams.set('url', request.url);
          if (pageId) u.searchParams.set('page_id', pageId);
          try {
            const r = await fetch(u, { signal: AbortSignal.timeout(1500), cf: { cacheTtl: 60, cacheEverything: true } } as RequestInit);
            if (r.ok) fragment = await r.text();
          } catch {
            /* 忽略 */
          }
          if (fragment) el.setInnerContent(fragment, { html: true });
        },
      })
      .transform(res);
  },
} satisfies ExportedHandler<Env>;
