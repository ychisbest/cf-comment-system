# cf-comment-system

纯 Cloudflare 无服务器多站点评论系统：Workers + Hono + D1 + R2 + Turnstile + Resend。一套后端供多个站点共用，站点只需嵌入一段 script。

特性：匿名评论（昵称 + 可选邮箱）、先发后审、嵌套回复、点赞/点踩、图片（前端压缩为 WebP）、Shadow DOM + 三种自定义 CSS 方式、浅色/深色、回复邮件通知、管理后台 + 管理 API、SEO 服务端片段（JSON-LD）。

## 目录

```
src/            Worker（routes/public|admin|ssr，lib/url|sanitize|ratelimit|email|turnstile|image…）
widget/         前端挂件源码（原生 TS，打包为 public/widget.js，约 8KB gzip）
admin/          后台页面源码
migrations/     D1 迁移
examples/       嵌入示例页、HTMLRewriter 注入 Worker、SSR 拉取脚本
test/           单元测试（vitest）
```

## 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars          # 全是假值，Turnstile 使用官方测试密钥
npm run build:widget
npx wrangler d1 migrations apply comments --local
npx wrangler d1 execute comments --local --file scripts/seed-dev.sql   # 创建测试站点 site_dev
npm run dev                              # http://localhost:8787
python3 -m http.server 3000 -d examples  # 嵌入示例页 http://localhost:3000
npm test && npm run typecheck
```

- 后台：<http://localhost:8787/admin>，密钥见 `.dev.vars` 的 `ADMIN_TOKEN`。
- 邮件本地测试：`node scripts/mock-resend.mjs` 启动假的 Resend（`.dev.vars` 里 `RESEND_API_URL` 指向它），用 `wrangler dev --test-scheduled` 后访问 `/__scheduled?cron=*/10+*+*+*+*` 触发队列。

## 部署（需要你自己的 Cloudflare 账号）

1. 创建资源
   ```bash
   npx wrangler d1 create comments          # 把输出的 database_id 填进 wrangler.toml
   npx wrangler r2 bucket create comments-images
   ```
2. 修改 `wrangler.toml` 的 `[vars]`：`TURNSTILE_SITEKEY`（在 Cloudflare 控制台创建 Turnstile 小部件，可见模式选 Managed）、`EMAIL_FROM`（Resend 已验证域名）、`PUBLIC_BASE_URL`（Worker 的最终域名）、限流数值。
3. 设置 secrets：
   ```bash
   npx wrangler secret put ADMIN_TOKEN        # 长随机字符串（≥ 32 位），后台登录用
   npx wrangler secret put TURNSTILE_SECRET
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put IP_SALT            # 长随机字符串；更换会使旧封禁/投票哈希失效
   ```
4. 迁移并部署：
   ```bash
   npx wrangler d1 migrations apply comments --remote
   npm run deploy
   ```
   在 Cloudflare 控制台给 Worker 绑定自定义域名（如 `comments.example.com`）。Resend 需为发信域名配置 SPF/DKIM。
5. 新增站点并嵌入：打开 `https://comments.example.com/admin` → 站点 → 新增站点（填名称和允许的域名，如 `example.com`、`*.example.com`），后台会生成嵌入代码：
   ```html
   <div id="comments"></div>
   <script src="https://comments.example.com/widget.js" data-site="site_xxxx" defer></script>
   ```
   可选属性：`data-page-id`（用固定 ID 代替 URL 匹配）、`data-lang`（auto 或 en/zh/zh-TW/ja/ko/es/fr/de/pt/ru/it/vi/id/tr/pl/nl/th/uk/hi/ar/he）、`data-theme`（light/dark）、`data-css-url`（外部样式表）、`data-target`（容器选择器）。

## 页面匹配

默认按规范化 URL（`lib/url.ts`：小写主机、去 `www.`、去 hash、删 `utm_*`/`fbclid`/`gclid`/`ref`/`spm` 等、其余参数排序、去末尾斜杠，`<link rel="canonical">` 优先）；`data-page-id` 优先于 URL。站点设置可关闭 www 去除、丢弃全部查询参数。

## 自定义外观

1. CSS 变量与 `::part()`：`#comments { --cm-accent: #16a34a; --cm-radius: 12px }`、`#comments::part(submit) { … }`。变量：`--cm-text --cm-muted --cm-border --cm-hover --cm-accent --cm-accent-text --cm-danger --cm-radius --cm-font --cm-gap`。part：`container header title sort sort-button form textarea input submit list item comment avatar meta name time text image tools vote-up vote-down reply-button replies more-button …`
2. 后台站点配置的 `custom_css`（带预览），由 widget 注入 Shadow DOM。
3. `data-css-url` 外部样式表。

## 管理 API

`Authorization: Bearer <ADMIN_TOKEN>`；失败 10 次/10 分钟后锁定（429）。所有响应为 JSON，错误形如 `{"error":"code"}`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST | `/admin/api/sites` | 列表 / 新建 `{name, domains[], custom_css?, settings?}`，返回 `embed_code` |
| PATCH | `/admin/api/sites/:id` | 修改 `name/domains/custom_css/settings`（settings 为合并更新） |
| DELETE | `/admin/api/sites/:id?confirm=<id>` | 删除站点及全部评论、图片 |
| GET | `/admin/api/comments?site=&status=&q=&since=&pending=1&ip_hash=&cursor=&limit=` | 评论列表（`next_cursor` 翻页；不含邮箱，含 `ip_hash`、`pending_review`） |
| PATCH | `/admin/api/comments/:id` | `{status: visible|hidden|spam}` 或 `{approved: true}` |
| DELETE | `/admin/api/comments/:id` | 永久删除 |
| POST | `/admin/api/comments/bulk` | `{action: hide|spam|restore|approve|delete, ids[≤200]}` |
| GET/POST/DELETE | `/admin/api/bans[/:id]` | POST：`{comment_id, scope: site|global, hide_existing?}` 或 `{ip_hash, site_id?}` |
| GET | `/admin/api/stats` | 各站点可见数、24h 新增、待核查、隐藏/垃圾 |

Agent 自动审核示例：`GET /admin/api/comments?pending=1` 取待核查 → `POST …/bulk {"action":"spam","ids":[…]}` 或 `approve`。

站点设置项（`settings`）：`lang pageSize allowImages maxDepth maxLength stripWww queryMode(keep|drop) ssrEnabled ssrDelayHours(默认24) ssrMaxComments maxLinks(默认1) blacklist[]`。

## SEO 收录

`GET /ssr?site=&url=&page_id=&format=html|json`，只输出 `visible` 且（已人工通过，或未被标记且发布超过 `ssrDelayHours`）的评论；语义化 `<article>`/`<time>`，`application/ld+json`（schema.org `Comment`），链接 `rel="nofollow ugc noopener"`，缓存 60 秒 + SWR。外链数 > `maxLinks` 或命中黑名单的评论标记为"待核查"，不进入片段，直到后台点"通过核查"。

- 方案 A（站点在 Cloudflare 上）：部署 `examples/ssr-injector`（HTMLRewriter 注入 `<div id="comments">`）。widget 接管后用 Shadow DOM 渲染，注入的 HTML 留在 light DOM 里供爬虫读取而不重复显示。
- 方案 B：构建脚本或服务端调用 `/ssr?format=json`（见 `examples/ssr-fetch.mjs`）自行写入页面。

## 安全要点

存储时剥除所有 HTML、前端只用 `textContent`；Origin 必须在站点白名单；发表与上传必须通过服务端 Turnstile 校验；按 `ip_hash` 分钟/小时/天限流（429 + `Retry-After`）；图片仅 JPEG/PNG/WebP/GIF，按魔数识别、≤ 2MB、随机 key、`nosniff`，24 小时未引用自动清理；IP 仅存盐值哈希，邮箱不对外返回；管理 token 常量时间比较 + 失败锁定；全部 SQL 为预编译绑定；每评论每 voter 只计一票。

## 免费额度提示

`/widget.js` 强缓存、图片 immutable 缓存，评论接口短缓存（`private, max-age=5`）。部署前请到 Cloudflare 官网核对 Workers / D1 / R2 / Resend 最新免费额度；流量上来后升级 Workers 付费版即可。
