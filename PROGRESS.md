# 进度

| 阶段 | 状态 | 说明 |
|---|---|---|
| 1 最小可用 | ✅ | 建表、站点/页面、发表与读取、CORS、URL 规范化、widget 基础渲染 |
| 2 互动与外观 | ✅ | 嵌套回复、投票（votes 表重算计数）、排序/分页、深浅色、Shadow DOM、CSS 变量/part/custom_css/data-css-url |
| 3 图片与防滥用 | ⏳ | |
| 4 后台与管理 API | ⏳ | |
| 5 邮件通知 | ⏳ | |
| 6 SEO 收录 | ⏳ | |

## 阶段 1 验证
- `npm test`：URL 规范化 / 净化 / 来源校验单测通过
- `wrangler dev --local` + 本地 D1：非白名单 Origin → 403；发表后刷新可见；带不同 utm/fbclid/hash 的 URL 读到同一批评论；HTML 标签被剥除
- 说明：widget 全部前端逻辑（回复/投票/图片/Turnstile 等）在阶段 1 一并编写，对应后端接口在各自阶段补齐并验证。

## 阶段 2 验证
- API：同一 voter 重复点击同值取消、反向切换，换 UA 算另一票；new/hot/old 三种排序分页（cursor）正确；跨页面 parent 被拒
- 浏览器（ego-browser）实测：Shadow DOM 渲染；宿主页 `--cm-accent` 变量与 `::part(submit)` 覆盖生效；浏览器内发表评论成功并显示（含懒加载 Turnstile 测试 key 取 token）
- 修复：默认变量放在 `:host`，否则宿主页无法用 CSS 变量覆盖
