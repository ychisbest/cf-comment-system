import { build } from 'esbuild';
import { mkdirSync, copyFileSync, existsSync, statSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

mkdirSync('public/admin', { recursive: true });

await build({
  entryPoints: ['widget/index.ts'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  outfile: 'public/widget.js',
  loader: { '.css': 'text' },
  legalComments: 'none',
});
const gz = gzipSync(readFileSync('public/widget.js')).length;
console.log(`widget.js ${statSync('public/widget.js').size} bytes, gzip ${gz} bytes`);
if (gz > 30 * 1024) {
  console.error('widget.js 超过 30KB gzip 目标');
  process.exit(1);
}

if (existsSync('admin/admin.ts')) {
  await build({
    entryPoints: ['admin/admin.ts'],
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'es2020',
    outfile: 'public/admin/admin.js',
    loader: { '.css': 'text' },
  });
  for (const f of ['index.html', 'admin.css']) if (existsSync('admin/' + f)) copyFileSync('admin/' + f, 'public/admin/' + f);
}
