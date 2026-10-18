# 进度

| 阶段 | 状态 | 说明 |
|---|---|---|
| 1 最小可用 | ✅ | 建表、站点/页面、发表与读取、CORS、URL 规范化、widget 基础渲染 |
| 2 互动与外观 | ✅ | 嵌套回复、投票（votes 表重算计数）、排序/分页、深浅色、Shadow DOM、CSS 变量/part/custom_css/data-css-url |
| 3 图片与防滥用 | ✅ | R2 上传、魔数校验、Turnstile、D1 固定窗口限流、封禁检查、重复内容、cron 清理 |
| 4 后台与管理 API | ✅ | 站点 CRUD、评论审核/批量、封禁、统计、响应式后台页（CSP 严格） |
| 5 邮件通知 | ✅ | 订阅、Resend 发送（waitUntil）、10 分钟限频合并、日额度排队、退订 |
| 6 SEO 收录 | ✅ | `/ssr`（html/json）、JSON-LD、延迟收录、外链/黑名单过滤、HTMLRewriter 注入示例 |

## 阶段 1 验证
- `npm test`：URL 规范化 / 净化 / 来源校验单测通过
- `wrangler dev --local` + 本地 D1：非白名单 Origin → 403；发表后刷新可见；带不同 utm/fbclid/hash 的 URL 读到同一批评论；HTML 标签被剥除
- 说明：widget 全部前端逻辑（回复/投票/图片/Turnstile 等）在阶段 1 一并编写，对应后端接口在各自阶段补齐并验证。

## 阶段 2 验证
- API：同一 voter 重复点击同值取消、反向切换，换 UA 算另一票；new/hot/old 三种排序分页（cursor）正确；跨页面 parent 被拒
- 浏览器（ego-browser）实测：Shadow DOM 渲染；宿主页 `--cm-accent` 变量与 `::part(submit)` 覆盖生效；浏览器内发表评论成功并显示（含懒加载 Turnstile 测试 key 取 token）
- 修复：默认变量放在 `:host`，否则宿主页无法用 CSS 变量覆盖

## 阶段 3 验证
- 单测 31 个通过（含限流、魔数、key 格式、Turnstile fail-closed）
- 本地 smoke：SVG、伪装成 .png 的 SVG 被 415 拒绝；真 PNG 改名 .svg 按魔数存为 png；>2MB 返回 413；无 Origin 403；无 Turnstile token 403；超限 429（带 Retry-After）；图片响应 nosniff + immutable 缓存；key 只能被引用一次；相同内容 409
- cron：把未引用上传回拨 25h 后触发 `/__scheduled`，R2 对象和记录被清理
- Turnstile 本地用官方测试 secret（`1x…AA`）真实调用 siteverify

## 阶段 4 验证
- 管理 API：无/错误 token → 401；连续 10 次失败 → 429 锁定（含正确 token）；站点创建返回嵌入代码，非法域名 400
- 隐藏评论后 `/api/comments` 立即不再返回且 total 减少；批量 spam/restore；封禁后同 IP 发表 403，`hide_existing` 隐藏其现有评论
- 浏览器实测后台：登录后令牌仅在 sessionStorage（localStorage 为空）；站点页 CSS 预览渲染；站点 `custom_css` 经 `/api/comments` 的 config 注入 widget 生效
- 后台页 CSP：`script-src 'self'`，无内联脚本

## 阶段 5 验证（本地用 scripts/mock-resend.mjs 充当 Resend）
- 回复后被回复者收到 1 封邮件（Authorization 头、List-Unsubscribe 头、摘要与 `#cm-<id>` 链接齐全）；自己回复自己不通知
- 10 分钟内的后续回复进入 email_queue；节流未过时 cron 不发；过期后合并为 1 封"2 条新回复"
- 邮件服务返回 500 时评论照常发表并排队，恢复后 cron 补发
- 退订链接：无效 token 404；有效 token 删除该邮箱订阅与队列，之后回复不再发信
- 待核查（flagged）的回复不触发通知，发送前再次检查回复仍为 visible
- 邮件内容全部 HTML 转义、主题去换行（单测）

## 阶段 6 验证
- `/ssr`：24h 内的新评论不出现；外链数 > 1 的评论不出现，后台"通过核查"（flagged=2）后立即出现；旧评论与其回复嵌套输出；内容转义，链接带 `rel="nofollow ugc noopener"`；JSON-LD 转义 `<>&`（单测）；`Cache-Control: public, max-age=60, stale-while-revalidate=300`
- `examples/ssr-injector` 在本地 `wrangler dev` 下转发到示例页：`curl` 原始 HTML（不执行 JS）里 `<div id="comments">` 内已有评论与 `application/ld+json`
- 浏览器实测：widget 接管后 Shadow DOM 正常渲染，注入的 light DOM 内容保留（3 条）且不重复显示

## 最终总结
全部 6 个阶段已通过本地验证（`npm test`：34 个单测全部通过；`npm run typecheck` 通过；`wrangler dev --local` 对 D1/R2 的 smoke 测试，浏览器实测 widget 与后台）。

交付物（SPEC 第 14 节）：源码 + `wrangler.toml`（占位符）、`migrations/0001-0003`、`README.md`、单元测试（URL、净化、限流、魔数、Turnstile、邮件、SSR）、嵌入示例页 `examples/index.html`。

未做 / 需要你注意：
- **未部署、未创建任何远程资源、未使用真实密钥**。`wrangler.toml` 中 `database_id`、`PUBLIC_BASE_URL`、`EMAIL_FROM`、`TURNSTILE_SITEKEY`（目前是官方测试 key）上线前必须替换，并用 `wrangler secret put` 设置 4 个 secret。
- Resend 实发、真实 Turnstile 挑战、真实 R2/D1 远程行为仅在本地模拟下验证（邮件用 `scripts/mock-resend.mjs`）。
- 与 SPEC 的小偏差/决定：①头像用本地生成的首字母色块，不使用 Gravatar（避免泄露邮箱哈希）；②退订会删除该邮箱的全部订阅；③`email_hash` 为加盐哈希；④待核查评论不触发回复通知；⑤widget 前端逻辑在阶段 1 一次性写成，各后端接口在对应阶段补齐验证；⑥管理后台登录失败按 IP 锁定 10 分钟（共用同一出口 IP 时会互相影响）。
- 评论列表接口 `private, max-age=5`：后台隐藏后最多约 5 秒内浏览器缓存仍可能显示（widget 自身请求用 `no-cache`，刷新即生效）。
