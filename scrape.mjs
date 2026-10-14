#!/usr/bin/env node
/**
 * scrape.mjs — 抓取 HHACMOJ 题库与历史作业，输出未出题清单数据
 *
 * 数据源（全部为公开页面，无需登录）：
 *   - 题库列表  https://oj.hhacm.pw/p?page=1..N
 *   - 作业列表  https://oj.hhacm.pw/homework   （页面内嵌 JSON，含每份作业的 pids）
 *
 * 输出：
 *   - data.json   页面读取的数据文件
 *
 * 用法：node scrape.mjs
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://oj.hhacm.pw';
const UA = 'Mozilla/5.0 (compatible; HHACMOJ-unsolved-list/1.0)';
const OUT_DIR = process.argv[2] || '.';
const TIMEOUT_MS = 30000;

// 基础语法范围：一本通编程启蒙 第 2~16 章
const MIN_CH = 2;
const MAX_CH = 16;

// ---------------------------------------------------------------- HTTP

async function get(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- 解析

const decode = s => s
  .replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

function parseProblemRows(html) {
  const out = [];
  const rowRe = /<tr data-pid="(\d+)">([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRe.exec(html))) {
    const pid = Number(m[1]);
    const cell = m[2];
    const nm = cell.match(/<td class="col--name col--problem-name"[^>]*>([\s\S]*?)<\/td>/);
    let name = '';
    if (nm) {
      const a = nm[1].match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
      name = decode(a ? a[2] : nm[1]);
    }
    const ac = decode((cell.match(/<td class="col--ac-tried">([\s\S]*?)<\/td>/) || [, ''])[1]);
    const dm = decode((cell.match(/<td class="col--difficulty">([\s\S]*?)<\/td>/) || [, ''])[1]);
    const tags = [...cell.matchAll(/href="\/p\?q=category%3A([^"]+)"/g)]
      .map(x => decodeURIComponent(x[1]));
    out.push({
      pid, name, ac,
      difficulty: /^\d+$/.test(dm) ? Number(dm) : null,
      tags,
    });
  }
  return out;
}

/** 解析页面内嵌的 window.XxxContext = '...' */
function parseEmbedded(html, varName) {
  const marker = `window.${varName} = '`;
  const i = html.indexOf(marker);
  if (i < 0) return null;
  const start = i + marker.length;
  let j = start;
  while (j < html.length) {
    if (html[j] === '\\') { j += 2; continue; }
    if (html[j] === "'") break;
    j++;
  }
  const raw = html.slice(start, j).replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : (parsed?.docs ?? parsed);
}

function maxPageOf(html) {
  const nums = [...html.matchAll(/[?&]page=(\d+)/g)].map(x => Number(x[1]));
  return nums.length ? Math.max(...nums) : 1;
}

// ---------------------------------------------------------------- 主流程

async function main() {
  console.log('▶ 抓取题库列表 …');
  const bank = new Map();
  const first = await get(`${BASE}/p?page=1`);
  const pages = maxPageOf(first);
  for (const p of parseProblemRows(first)) bank.set(p.pid, p);
  for (let i = 2; i <= pages; i++) {
    const t = await get(`${BASE}/p?page=${i}`);
    for (const p of parseProblemRows(t)) bank.set(p.pid, p);
    process.stdout.write(`  第 ${i}/${pages} 页\r`);
  }
  console.log(`\n  题库共 ${bank.size} 题`);

  console.log('▶ 抓取作业列表 …');
  const hwHtml = await get(`${BASE}/homework`);
  const homeworks = parseEmbedded(hwHtml, 'UiContextNew') || [];
  const usedPids = new Set();
  for (const h of homeworks) for (const p of (h.pids || [])) usedPids.add(Number(p));
  console.log(`  作业 ${homeworks.length} 份，已出过 ${usedPids.size} 个 pid`);

  console.log('▶ 计算未出题清单 …');
  const basic = [];
  for (const p of bank.values()) {
    if (!p.tags.includes('一本通编程启蒙')) continue;
    const t = p.name.match(/^T(\d+)\s+(.*)$/s);
    if (!t) continue;
    const title = t[2];
    const c = title.match(/[例练]\s*(\d+)[.．](\d+)/);
    if (!c) continue;
    const ch = Number(c[1]);
    if (ch < MIN_CH || ch > MAX_CH) continue;
    const parts = (p.ac || '').split('/').map(s => s.trim());
    basic.push({
      pid: p.pid,
      tno: Number(t[1]),
      title,
      ch,
      difficulty: p.difficulty,
      passed: /^\d+$/.test(parts[0] || '') ? Number(parts[0]) : null,
      tried: /^\d+$/.test(parts[1] || '') ? Number(parts[1]) : null,
      used: usedPids.has(p.pid),
    });
  }
  basic.sort((a, b) => (a.tno ?? 0) - (b.tno ?? 0));

  const unused = basic.filter(p => !p.used);
  const usedInScope = basic.filter(p => p.used);

  const data = {
    generatedAt: new Date().toISOString(),
    source: BASE,
    range: { minChapter: MIN_CH, maxChapter: MAX_CH },
    stats: {
      bankSize: bank.size,
      homeworkCount: homeworks.length,
      usedPidCount: usedPids.size,
      basicTotal: basic.length,
      unusedCount: unused.length,
      usedInScopeCount: usedInScope.length,
    },
    unused: unused.map(({ pid, tno, title, ch, difficulty, passed, tried }) =>
      ({ pid, tno, title, ch, difficulty, passed, tried })),
    usedInScope: usedInScope.map(({ pid, tno, title, ch }) => ({ pid, tno, title, ch })),
    homeworks: homeworks
      .map(h => ({ title: h.title, beginAt: h.beginAt, pids: (h.pids || []).map(Number) }))
      .sort((a, b) => (a.beginAt || '').localeCompare(b.beginAt || '')),
  };

  await mkdir(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, 'data.json');
  await writeFile(outFile, JSON.stringify(data, null, 2), 'utf8');

  console.log(`\n✅ 完成：未出过 ${unused.length} 题 / 已出过 ${usedInScope.length} 题`);
  console.log(`   已写入 ${outFile}`);
}

main().catch(err => {
  console.error('\n❌ 抓取失败：', err.message);
  process.exit(1);
});
