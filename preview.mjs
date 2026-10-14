#!/usr/bin/env node
/**
 * preview.mjs — 本地预览（模拟 GitHub Pages 环境）
 *
 * 用法：
 *   node preview.mjs            直接预览（复用已有 data.json，最快）
 *   node preview.mjs --fresh    先重新抓取一次数据，再预览
 *
 * 然后打开 http://127.0.0.1:8788
 *
 * 说明：必须通过 HTTP 服务访问。直接双击 index.html 会因 file:// 协议
 *       无法读取 data.json 而报错。
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8788);
const FRESH = process.argv.includes('--fresh');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
};

// 仅在 --fresh 时才重新抓取，避免每次预览都等一轮网络请求
if (FRESH) {
  console.log('▶ 重新抓取数据 …\n');
  await new Promise(resolve => {
    const p = spawn(process.execPath, [path.join(DIR, 'scrape.mjs'), DIR], {
      stdio: 'inherit',
      cwd: DIR,
    });
    p.on('exit', code => {
      if (code !== 0) {
        console.log('\n⚠️  抓取失败；将使用已有的 data.json（若有）。');
      }
      resolve();
    });
  });
} else {
  try {
    const st = await stat(path.join(DIR, 'data.json'));
    const ageMin = Math.round((Date.now() - st.mtimeMs) / 60000);
    console.log(`▶ 使用已有 data.json（${ageMin} 分钟前生成）`);
    console.log('  想重新抓取请运行：node preview.mjs --fresh\n');
  } catch {
    console.log('▶ 尚未生成 data.json，自动抓取一次 …\n');
    await new Promise(resolve => {
      const p = spawn(process.execPath, [path.join(DIR, 'scrape.mjs'), DIR], {
        stdio: 'inherit',
        cwd: DIR,
      });
      p.on('exit', () => resolve());
    });
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';

    // 防目录穿越
    const filePath = path.join(DIR, rel);
    if (!filePath.startsWith(DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    const st = await stat(filePath);
    if (st.isDirectory()) {
      res.writeHead(404);
      return res.end('Not found');
    }

    const body = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n✅ 本地预览已启动：http://127.0.0.1:${PORT}`);
  console.log('   按 Ctrl+C 停止\n');
});
