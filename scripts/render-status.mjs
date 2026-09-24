#!/usr/bin/env node
// ============ 状态可视化生成器 ============
// 单一事实源：doc/STATUS.md（§1 状态总表 / §2 触发清单 / §3 反例）+ doc/architecture/节点化迁移计划.md（进度区）
// 输出：doc/status.html（自包含，无外部依赖，双击即看）
// 纪律：**不要手改 status.html**——改 STATUS.md 后重跑本脚本（见 STATUS.md §2 触发清单）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATUS = path.join(ROOT, 'doc/STATUS.md');
const PLAN = path.join(ROOT, 'doc/architecture/节点化迁移计划.md');
const OUT = path.join(ROOT, 'doc/status.html');

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

function parseTables(md) {
  const lines = md.split('\n');
  const tables = [];
  let cur = null;
  for (const line of lines) {
    if (/^\|/.test(line)) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (/^-{2,}/.test(cells[0]) || cells.every((c) => /^:?-+:?$/.test(c))) continue;
      if (!cur) { cur = []; tables.push(cur); }
      cur.push(cells);
    } else { cur = null; }
  }
  return tables;
}

const md = fs.readFileSync(STATUS, 'utf8');
const tables = parseTables(md);
const main = tables.find((t) => t[0][0] === '#');          // §1 状态总表
const triggers = tables.find((t) => t[0][0] === '你做了什么'); // §2 触发清单
const anti = tables.find((t) => t[0][0] === '反例');           // §3 反例

const tone = (row) => {
  const mark = String((row.find((c) => /^(✅|🟡|⚠️|⬜|·)$/.test(String(c).trim())) || '')).trim();
  return mark === '✅' ? 'ok' : mark === '🟡' ? 'mid' : mark === '⚠️' ? 'warn' : mark === '⬜' ? 'todo' : 'flat';
};
const lastChecked = (md.match(/最后核对：([^\n]+)/) || [, '(未标)'])[1].replace(/\*\*/g, '');

// 节点化进度（D 系列）
let milestones = [];
try {
  const plan = fs.readFileSync(PLAN, 'utf8');
  milestones = plan.split('\n').filter((l) => /^- \[[x ]\] \*?\*?D\d+/.test(l)).map((l) => ({
    done: l.startsWith('- [x]'),
    text: l.replace(/^- \[[x ]\] /, '').slice(0, 150),
  }));
} catch (e) { milestones = []; }

const rowsHtml = (main || []).slice(1).map((r) => {
  const t = tone(r);
  return '<tr class="' + t + '"><td class="num">' + inline(r[0]) + '</td><td class="item">' + inline(r[1]) + '</td>'
    + '<td class="val">' + inline(r[2] || '') + '</td><td class="src">' + inline(r[3] || '') + '</td><td class="link">' + inline(r[4] || '') + '</td></tr>';
}).join('\n');

const trgHtml = (triggers || []).slice(1).map((r) => '<tr><td>' + inline(r[0]) + '</td><td>' + inline(r[1]) + '</td></tr>').join('\n');
const antiHtml = (anti || []).slice(1).map((r) => '<tr><td>' + inline(r[0]) + '</td><td>' + inline(r[1]) + '</td></tr>').join('\n');
const msHtml = milestones.map((m) => '<li class="' + (m.done ? 'done' : 'todo') + '"><span class="dot"></span>' + inline(m.text) + '</li>').join('\n');

const counts = (main || []).slice(1).reduce((a, r) => { const t = tone(r); a[t] = (a[t] || 0) + 1; return a; }, {});

const html = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>ai-learning-system · 进度看板</title>
<style>
:root{--bg:#0f1115;--card:#171a21;--line:#262b36;--fg:#e6e9ef;--dim:#9aa4b2;--ok:#3fb950;--mid:#d29922;--warn:#f85149;--todo:#6e7681}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.6 -apple-system,"PingFang SC",sans-serif;padding:28px}
h1{font-size:20px;margin:0 0 4px}.sub{color:var(--dim);margin-bottom:20px}
.cards{display:flex;gap:12px;margin-bottom:22px;flex-wrap:wrap}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 16px;min-width:112px}
.card .n{font-size:22px;font-weight:700}.card .l{color:var(--dim);font-size:12px}
.ok .n{color:var(--ok)}.warn .n{color:var(--warn)}.mid .n{color:var(--mid)}.todo .n{color:var(--todo)}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-bottom:22px}
th{position:sticky;top:0;background:#1b1f27;text-align:left;padding:9px 10px;font-size:12px;color:var(--dim);border-bottom:1px solid var(--line)}
td{padding:9px 10px;border-bottom:1px solid #1d2129;vertical-align:top}
tr:last-child td{border-bottom:none}
tr.ok td.item,tr.ok td.val{color:#c8e6c9}tr.warn td.item,tr.warn td.val{color:#ffd7d5}
td.num{width:34px;color:var(--dim)}td.src{color:var(--dim);font-size:12px;width:26%}td.link{color:var(--dim);font-size:12px;width:22%}
code{background:#20242d;padding:1px 5px;border-radius:4px;font-size:12px}
a{color:#58a6ff;text-decoration:none}ul{list-style:none;padding-left:0}
li{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin-bottom:6px;display:flex;gap:8px;align-items:flex-start}
li .dot{width:8px;height:8px;border-radius:50%;margin-top:7px;flex:0 0 8px}
li.done .dot{background:var(--ok)}li.todo .dot{background:var(--todo)}
li.todo{color:var(--dim)}
h2{font-size:15px;margin:24px 0 10px;color:var(--dim);font-weight:600}
</style></head><body>
<h1>ai-learning-system · 进度看板</h1>
<div class="sub">单一事实源：<code>doc/STATUS.md</code>（生成于 ${new Date().toISOString().slice(0,16).replace('T',' ')}）｜最后核对 ${esc(lastChecked)}｜<b>不要手改本页</b>，改 STATUS.md 后重跑 <code>node scripts/render-status.mjs</code></div>
<div class="cards">
<div class="card ok"><div class="n">${counts.ok || 0}</div><div class="l">正常/已完成</div></div>
<div class="card mid"><div class="n">${counts.mid || 0}</div><div class="l">部分/进行中</div></div>
<div class="card warn"><div class="n">${counts.warn || 0}</div><div class="l">风险/待拍板</div></div>
<div class="card todo"><div class="n">${counts.todo || 0}</div><div class="l">未做</div></div>
</div>
<h2>① 状态总表</h2>
<table><thead><tr><th>#</th><th>状态项</th><th>当前值</th><th>权威来源</th><th>联动位置</th></tr></thead><tbody>
${rowsHtml}
</tbody></table>
${milestones.length ? '<h2>② 节点化进度（D 系列）</h2><ul>' + msHtml + '</ul>' : ''}
<h2>③ 改了什么 → 要同步哪些</h2>
<table><thead><tr><th>你做了什么</th><th>必须更新</th></tr></thead><tbody>${trgHtml}</tbody></table>
<h2>④ 别再犯（反例）</h2>
<table><thead><tr><th>反例</th><th>为什么错</th></tr></thead><tbody>${antiHtml}</tbody></table>
</body></html>`;

fs.writeFileSync(OUT, html);
console.log('已生成 ' + path.relative(ROOT, OUT) + '｜' + Math.round(html.length / 1024) + 'KB｜状态项 ' + ((main || []).length - 1) + ' 条｜D 系列 ' + milestones.length + ' 条');
console.log('分布：' + JSON.stringify(counts));
