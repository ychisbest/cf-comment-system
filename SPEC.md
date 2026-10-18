# 多站点评论系统 规格文档（交给 Agent 实现）

## 0. 给 Agent 的开场指令

按本文档实现一个**纯 Cloudflare 无服务器评论系统**：一套后端，供 5–30 个网站共用，每个网站只需嵌入一行 script。不使用任何自建服务器、Docker 或 VPS。每完成一个阶段先部署并通过该阶段验收，再进入下一阶段。安全要求（第 9 节）是硬性要求，不可省略。

## 1. 已确认的需求

| 项目 | 决定 |
|---|---|
| 访客地区 | 主要海外，只用 Cloudflare，不用火山引擎 |
| 站点数量 | 5–30 个，需要站点管理 |
| 评论者身份 | 匿名（昵称 + 可选邮箱） |
| 审核方式 | 先发后审（发表即显示，站长事后删除/隐藏） |
| 评论功能 | 图片回复、嵌套回复、点赞/点踩 |
| 页面匹配 | 两种都支持：默认按规范化 URL，可用 `data-page-id` 覆盖 |
| 外观 | 完全自定义 CSS |
| 通知 | 有人回复时邮件通知被回复者（用 Resend） |
| 管理 | 网页后台 + API 都要（API 方便 Agent 自动审核） |
| SEO | 评论内容尽量被搜索引擎收录 |

## 2. 技术栈

- 运行时：Cloudflare Workers（TypeScript），框架用 Hono
- 数据库：D1（SQLite）
- 图片：R2
- 防机器人：Cloudflare Turnstile
- 邮件：Resend
- 部署：Wrangler，配置文件 `wrangler.toml`
- 前端挂件：原生 TypeScript，无框架，打包成单个 `widget.js`（目标 < 30KB gzip），由同一个 Worker 提供
- 后台页面：单页静态 HTML（同一 Worker 提供静态资源），不引入重型框架

## 3. 项目结构

```
/src
  index.ts            # Hono 路由入口
  routes/public.ts    # 评论读取、发表、投票、上传
  routes/admin.ts     # 管理 API（需鉴权）
  routes/ssr.ts       # SEO 用的服务端渲染片段
  lib/url.ts          # URL 规范化
  lib/sanitize.ts     # 内容净化
  lib/ratelimit.ts
  lib/email.ts        # Resend
  lib/turnstile.ts
/widget               # 前端挂件源码
/admin                # 后台静态页
/migrations           # D1 SQL 迁移
wrangler.toml
README.md
```

## 4. 数据模型（D1）

```sql
CREATE TABLE sites (
  id TEXT PRIMARY KEY,              -- 如 "site_abc"，嵌入代码里的 data-site
  name TEXT NOT NULL,
  domains TEXT NOT NULL,            -- JSON 数组，允许的域名，用于 CORS 和来源校验
  custom_css TEXT DEFAULT '',       -- 该站点的自定义 CSS
  settings TEXT DEFAULT '{}',       -- JSON：语言、每页条数、是否允许图片、嵌套层数上限等
  created_at INTEGER NOT NULL
);

CREATE TABLE pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL,
  page_key TEXT NOT NULL,           -- 规范化 URL 或 data-page-id
  title TEXT,
  url TEXT,
  comment_count INTEGER DEFAULT 0,
  UNIQUE(site_id, page_key)
);

CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL,
  site_id TEXT NOT NULL,
  parent_id INTEGER,                -- 直接父评论
  root_id INTEGER,                  -- 顶层评论，便于一次取整个楼层
  nickname TEXT NOT NULL,
  email TEXT,                       -- 永不对外返回
  email_hash TEXT,                  -- 用于头像
  content TEXT NOT NULL,            -- 净化后的纯文本（或受限 Markdown 渲染前原文）
  image_key TEXT,                   -- R2 对象 key，可空
  status TEXT NOT NULL DEFAULT 'visible',  -- visible / hidden / spam / deleted
  likes INTEGER DEFAULT 0,
  dislikes INTEGER DEFAULT 0,
  ip_hash TEXT NOT NULL,            -- 盐值哈希，不存明文 IP
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_comments_page ON comments(page_id, status, created_at);
CREATE INDEX idx_comments_root ON comments(root_id);

CREATE TABLE votes (
  comment_id INTEGER NOT NULL,
  voter_hash TEXT NOT NULL,         -- 盐值哈希(IP + UA + 站点)
  value INTEGER NOT NULL,           -- 1 / -1
  PRIMARY KEY (comment_id, voter_hash)
);

CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL,      -- 订阅该评论的回复
  email TEXT NOT NULL,
  unsubscribe_token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE bans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT,                     -- 为空表示全站点封禁
  ip_hash TEXT,
  reason TEXT,
  created_at INTEGER NOT NULL
);
```

## 5. 对外 API

公开接口（均校验 Origin 是否在该站点 `domains` 内）：

- `GET  /api/comments?site=&url=&page_id=&cursor=&sort=` 取评论（树形或扁平+root_id，分页）
- `POST /api/comments` 发表评论（含 Turnstile token、可选 image_key、可选 parent_id）
- `POST /api/vote` 点赞/点踩，再次点击同值则取消，反向则切换
- `POST /api/upload` 上传图片，返回 image_key（需 Turnstile，单独限流）
- `GET  /img/:key` 图片读取（Worker 代理 R2，加长缓存头）
- `GET  /api/unsubscribe?token=` 退订
- `GET  /widget.js` 前端挂件

管理接口（请求头 `Authorization: Bearer <ADMIN_TOKEN>`，token 存 Worker secret）：

- 站点：`GET/POST/PATCH/DELETE /admin/api/sites`（含自定义 CSS、域名白名单）
- 评论：`GET /admin/api/comments?site=&status=&q=&since=`、`PATCH /admin/api/comments/:id`（改状态）、批量操作 `POST /admin/api/comments/bulk`
- 封禁：`GET/POST/DELETE /admin/api/bans`
- 统计：`GET /admin/api/stats`

要求管理 API 稳定、字段清晰，因为后续会让别的 Agent 调用做自动审核。

## 6. 页面匹配规则

1. 若嵌入代码有 `data-page-id`，`page_key = "id:" + 该值`。
2. 否则使用规范化 URL：
   - 小写主机名，去掉 `www.`（或按站点配置保留）
   - 去掉 hash
   - 删除跟踪参数：`utm_*`、`fbclid`、`gclid`、`ref`、`spm` 等
   - 其余查询参数按字母排序后保留（可在站点设置中改为全部丢弃）
   - 去掉末尾斜杠（根路径除外）
   - 若页面有 `<link rel="canonical">`，优先使用它
3. 规范化逻辑放在 `lib/url.ts`，并写单元测试，前后端使用同一份逻辑。

## 7. 前端挂件

嵌入方式：

```html
<div id="comments"></div>
<script src="https://comments.example.com/widget.js"
        data-site="site_abc"
        data-page-id=""        <!-- 可选 -->
        data-lang="auto"
        defer></script>
```

要求：

- 使用 Shadow DOM，隔离宿主页面样式
- 自定义 CSS 的三种方式，全部要支持：
  1. 暴露 CSS 变量（`--cm-bg`、`--cm-text`、`--cm-accent`、`--cm-radius` 等），并给主要元素加 `part` 属性，宿主页面可用 `::part()` 覆盖
  2. 站点后台配置的 `custom_css`，由 widget 注入 Shadow DOM
  3. `data-css-url` 指向外部样式表
- 自带浅色/深色模式，跟随系统，也可用 `data-theme` 强制
- 功能：评论列表、排序（最新/最热）、嵌套回复（前端展示最多 3 层缩进，更深的归并到第 3 层）、点赞点踩、图片上传（见下）、昵称/邮箱记住在 localStorage、"有人回复时邮件通知我"勾选框
- 图片：前端用 canvas 压缩为最长边 ≤ 1600px 的 WebP，目标 ≤ 1MB；预览、可删除
- 懒加载：评论区进入视口再请求；Turnstile 在用户点击输入框时才加载
- 无障碍：键盘可用、`aria-label`、`prefers-reduced-motion`
- 渲染评论时一律使用 `textContent`，不使用 `innerHTML` 拼接用户内容

## 8. SEO 收录方案

评论默认由 JS 加载，搜索引擎不一定可靠收录。需要提供两种服务端注入方式，由站点选择：

**方案 A：HTMLRewriter 边缘注入（站点已经在 Cloudflare 上时）**
在站点域名上为 HTML 响应加一个 Worker 路由，用 `HTMLRewriter` 把 `GET /ssr?site=&url=` 返回的评论 HTML 片段注入到 `<div id="comments">` 内。widget 加载后接管并替换。

**方案 B：构建/服务端拉取片段**
提供 `GET /ssr?site=&url=&format=html|json`，站点的服务端或构建脚本调用后自行写入页面。

SSR 片段要求：

- 只输出 `status = visible` 的评论
- 语义化 HTML（`<article>`、`<time datetime>`）
- 附带 `application/ld+json`（schema.org `Comment`，挂在页面实体下），评论数少时全部输出，多时输出前 N 条
- 评论内的所有链接加 `rel="nofollow ugc noopener"`
- 响应带短缓存（如 60 秒）和 `stale-while-revalidate`
- 图片带 `loading="lazy"` 和 `alt`

SEO 风险与策略（需实现为站点设置项）：

- 匿名且先发后审，垃圾评论会直接进入被收录的页面。提供"评论发布 N 小时后才进入 SSR 片段"选项（默认 24 小时），给站长审核时间。
- 评论含外链数 > 1、含黑名单关键词时，不进入 SSR 片段，直到人工通过。
- 站点可单独关闭 SSR 收录。

## 9. 安全与防滥用（硬性要求）

1. **XSS**：服务端存储时去除所有 HTML 标签；前端用 `textContent` 渲染；昵称同样处理。若以后支持 Markdown，必须使用白名单净化库，且不允许 `javascript:` 等协议。
2. **CORS 与来源**：只允许站点 `domains` 内的 Origin；非白名单来源返回 403。注意这只能防浏览器端滥用，所以还需下面几条。
3. **Turnstile**：发表评论和上传图片必须验证 token，服务端调用 siteverify，不能只在前端判断。
4. **限流**：同一 `ip_hash` 每分钟/每小时/每天发表评论、上传、投票次数设上限，数值写在配置中；超限返回 429。
5. **图片上传**：
   - 只允许 JPEG/PNG/WebP/GIF，服务端检查文件头魔数，不信任 Content-Type 和扩展名
   - 禁止 SVG
   - 大小上限 2MB，超出拒绝
   - R2 key 使用随机 ID（如 `uploads/{site}/{yyyymm}/{uuid}.webp`），不使用用户文件名
   - 读取时返回 `Content-Type` 为已验证类型，并加 `X-Content-Type-Options: nosniff`
   - 未被任何评论引用的上传，24 小时后清理（Cron Trigger）
6. **隐私**：IP 只存盐值哈希；邮箱永远不在公开接口中返回；邮件中的退订链接使用不可猜测的 token。
7. **管理接口**：Bearer token 来自 Worker secret，常量时间比较；失败次数限流；后台页面不在页面里硬编码 token。
8. **重复内容与链接**：相同内容短时间重复提交拒绝；链接数超过阈值的评论标记为待核查。
9. **SQL**：全部使用 D1 预编译语句和参数绑定，禁止字符串拼接 SQL。
10. **投票防刷**：同一 `voter_hash` 对同一评论只计一票；voter_hash 用盐值哈希(IP+UA+站点)。

## 10. 回复通知邮件

- 发表评论时若勾选"有人回复时通知我"且填了邮箱，写入 `subscriptions`
- 有新回复时，通知被回复评论的订阅者（不通知自己）
- 邮件通过 Resend API 发送，发信域名需配置 SPF/DKIM
- 邮件内容：回复摘要（截断）、跳转到评论的链接、退订链接
- 同一订阅者对同一页面的通知做合并/限频（如每 10 分钟最多一封）
- 免费额度有日发送上限，超限时排队到下一个周期，不得丢弃发表评论的主流程；邮件发送失败不影响评论发表（用 `ctx.waitUntil`）

## 11. 管理后台（`/admin`）

单页，需输入管理密钥登录（只存 sessionStorage）。功能：

- 总览：各站点评论数、近 24 小时新增、待核查数
- 评论列表：按站点/状态/关键词筛选，可批量隐藏、标记垃圾、恢复、永久删除
- 一键封禁某评论的 IP 哈希（站点级或全局）
- 站点管理：新增站点（自动生成 site id 和嵌入代码）、编辑域名白名单、编辑自定义 CSS（带预览）、站点设置（SSR 延迟、图片开关、嵌套层数）
- 手机可用（响应式）

## 12. 分阶段实施与验收

**阶段 1：最小可用**
- D1 建表、站点与页面、发表与读取评论、widget 基础渲染、CORS、URL 规范化
- 验收：在一个测试站嵌入一行代码，能发表、刷新后能看到；换 utm 参数访问仍是同一批评论

**阶段 2：互动与外观**
- 嵌套回复、点赞点踩、排序、分页、深浅色、Shadow DOM、三种自定义 CSS 方式
- 验收：自定义 CSS 能覆盖主要元素；刷票无效

**阶段 3：图片与防滥用**
- R2 上传、前端压缩、魔数校验、Turnstile、限流、清理任务
- 验收：上传 SVG 或改后缀的文件被拒；超限请求返回 429

**阶段 4：后台与管理 API**
- 站点管理、评论审核、封禁、统计
- 验收：能在手机后台隐藏评论，并且 widget 立即不再显示

**阶段 5：邮件通知**
- 订阅、Resend 发送、退订、限频
- 验收：回复后被回复者收到邮件，退订链接生效

**阶段 6：SEO 收录**
- `/ssr` 接口、HTMLRewriter 注入示例、JSON-LD、延迟收录和外链过滤
- 验收：关闭 JS 后页面源码中能看到已通过的评论；新评论 24 小时内不出现在 SSR 中

## 13. 免费额度注意事项

按以下额度设计，部署前请到 Cloudflare 官网核对最新数字：

- Workers 免费版每天约 10 万次请求：widget.js 和图片必须设强缓存，评论列表接口加短缓存，避免每次浏览都打到 Worker
- D1 免费版有每日读写行数上限：评论列表查询必须走索引，避免全表扫描
- R2 有存储和操作次数上限：靠压缩和限流控制
- 站点数量多、流量上来后，升级 Workers 付费版即可，无需改架构

## 14. 交付物

1. 完整源码和 `wrangler.toml`（用占位符，不含真实密钥）
2. `migrations/` 下的 SQL
3. `README.md`：创建 D1/R2、设置 secrets（`ADMIN_TOKEN`、`TURNSTILE_SECRET`、`RESEND_API_KEY`、`IP_SALT`）、部署命令、新增站点并嵌入的步骤
4. 单元测试：URL 规范化、内容净化、限流、魔数校验
5. 一份嵌入示例页面
