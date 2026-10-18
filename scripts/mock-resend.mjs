// 本地测试用：假的 Resend API，把收到的请求追加写入 mock-resend.log
import http from 'node:http';
import { appendFileSync } from 'node:fs';
const log = process.argv[2] || 'mock-resend.log';
const failFile = process.argv[3]; // 若该文件存在则返回 500，用于测试失败/排队
import { existsSync } from 'node:fs';
http.createServer((req, res) => {
  let b = '';
  req.on('data', (d) => (b += d));
  req.on('end', () => {
    if (failFile && existsSync(failFile)) { res.writeHead(500).end('{"error":"down"}'); return; }
    appendFileSync(log, JSON.stringify({ auth: req.headers.authorization, body: JSON.parse(b || '{}') }) + '\n');
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"id":"mock"}');
  });
}).listen(9911, () => console.log('mock resend on 9911'));
