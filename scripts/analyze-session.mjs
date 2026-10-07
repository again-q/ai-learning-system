#!/usr/bin/env node
/**
 * 会话分析：session-406ef914（A/U 框架马拉松讨论）
 * 数据源：~/.dsh/sessions/--Users-apple-Desktop-ai-learning-system--/session-406ef914.../session.v4.jsonl.zstd
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const D = path.join(process.env.HOME, '.dsh/sessions/--Users-apple-Desktop-ai-learning-system--/session-406ef914-846c-4e7a-bf4a-f87a95705d9f/session.v4.jsonl.zstd');
const raw = execFileSync('zstd', ['-dc', D], { encoding: 'utf8', maxBuffer: 1 << 30 });
const lines = raw.split('\n').filter(Boolean);
const ev = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

console.log('='.repeat(90));
console.log('  会话分析：session-406ef914');
console.log('='.repeat(90));

const meta = ev.find((e) => e.type === 'session');
const t0 = meta.createdAt;
const times = ev.filter((e) => e.time).map((e) => e.time);
const tEnd = Math.max(...times);
console.log(`\n  会话 ID    : ${meta.id}`);
console.log(`  开始       : ${new Date(t0).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
console.log(`  最后活动   : ${new Date(tEnd).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
console.log(`  总时长     : ${((tEnd - t0) / 3600000).toFixed(1)} 小时`);
console.log(`  事件总数   : ${ev.length}`);
console.log(`  文件大小   : ${(fs.statSync(D).size / 1048576).toFixed(1)} MB（压缩后）`);

// ── 事件类型分布 ──
console.log('\n' + '='.repeat(90));
console.log('  事件类型分布');
console.log('='.repeat(90));
const types = {};
ev.forEach((e) => { types[e.type] = (types[e.type] || 0) + 1; });
console.log('');
Object.entries(types).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
  console.log(`  ${k.padEnd(32)} ${String(v).padStart(6)}  ${(v / ev.length * 100).toFixed(1)}%`);
});

// ── 用户消息 ──
console.log('\n' + '='.repeat(90));
console.log('  用户消息（轮次）');
console.log('='.repeat(90));
function textOf(e) {
  const d = e.data || {};
  if (typeof d.text === 'string') return d.text;
  if (Array.isArray(d.content)) return d.content.map((c) => c.text || '').join('');
  if (typeof d.content === 'string') return d.content;
  if (d.message && typeof d.message.content === 'string') return d.message.content;
  if (d.message && Array.isArray(d.message.content)) return d.message.content.map((c) => c.text || '').join('');
  return '';
}
const userMsgs = ev.filter((e) => e.type === 'user/message' || e.type === 'user-message' || (e.type || '').startsWith('user/'));
const uTypes = {};
ev.filter((e) => (e.type || '').startsWith('user')).forEach((e) => { uTypes[e.type] = (uTypes[e.type] || 0) + 1; });
console.log('\n  用户事件类型：', JSON.stringify(uTypes));
