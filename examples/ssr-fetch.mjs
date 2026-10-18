// 方案 B：构建脚本 / 服务端拉取片段，然后自行写入页面。
// 用法：node examples/ssr-fetch.mjs https://comments.example.com site_abc https://example.com/post
const [base, site, url] = process.argv.slice(2);
const res = await fetch(`${base}/ssr?` + new URLSearchParams({ site, url, format: 'json' }));
const data = await res.json();
console.log(`${data.count} comments`);
console.log(JSON.stringify(data.json_ld, null, 2));
