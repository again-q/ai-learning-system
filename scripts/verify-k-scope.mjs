#!/usr/bin/env node
// ============ K 口径核查（只读） ============
// 背景：上一场会话留下一句「K 的代码口径不对，statService 用 052 不是 060」。
// 本脚本用证据判定这句话是否成立 —— 结论决定「要不要改 K」。
//
// 判据：
//   ① 决策 060 是否已拍板入宪法/decision-log（未拍板 = 不能作为改动依据）
//   ② 052 拍板的口径与代码实现是否一致
//   ③ 线上数据是否符合 052 口径（correctCount 单调 ≤ attempts 等）
//
// 用法：node scripts/verify-k-scope.mjs
import { find, runRaw } from './db.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const L = '='.repeat(96);
const show = (t) => console.log('\n' + L + '\n  ' + t + '\n' + L);

show('① 决策 060 的拍板状态（读文档头）');
const d060 = fs.readFileSync(path.join(ROOT, 'doc/architecture/决策060-诊断产出判据集.md'), 'utf8').split('\n').slice(0, 12).join('\n');
console.log(d060);
const ratified = /状态：\*\*已定稿\*\*|状态：\*\*已拍板\*\*/.test(d060);
console.log(`  → 是否已定稿：${ratified ? '✅ 是' : '❌ 否（仍为「待审」）'}`);

show('② decision-log.md 是否收录决策 060');
const dlog = fs.readFileSync(path.join(ROOT, 'doc/decision-log.md'), 'utf8');
const has060 = /决策\s*060/.test(dlog);
console.log(`  → 决策日志里有「决策 060」条目：${has060 ? '✅ 有' : '❌ 无（未归档 = 未生效）'}`);
const last = (dlog.match(/## 决策 (\d+)/g) || []).slice(-6);
console.log('  → 日志里最后几条决策：', last.join(' / '));

show('③ 宪法里 K 的口径');
const theory = path.join(ROOT, 'doc/theory/五维能力向量框架-理论文档.md');
if (fs.existsSync(theory)) {
  const t = fs.readFileSync(theory, 'utf8');
  const idx = t.indexOf('§4.4') >= 0 ? t.indexOf('§4.4') : 0;
  const seg = t.slice(Math.max(0, t.indexOf('4.4')), t.indexOf('4.4') + 900);
  const hit = seg.split('\n').filter((l) => /K\s*=|用对|attempts/.test(l)).slice(0, 6);
  console.log(hit.length ? hit.join('\n') : '  （未在 §4.4 附近找到 K= 行，人工核对）');
  console.log(`  → 宪法提到「难度权重 0.1/0.2/0.7」：${/0\.1.{0,4}0\.2.{0,4}0\.7/.test(t) ? '⚠️ 有' : '✅ 无'}`);
} else {
  console.log('  ✖ 宪法文件不存在:', theory);
}

show('④ 线上数据是否符合 052 口径');
const kp = find('knowledge_progress', 1000);
console.log(`  knowledge_progress 行数：${kp.length}`);
let bad = 0, zeroAttempts = 0, over = 0;
for (const r of kp) {
  const a = Number(r.attempts) || 0, c = Number(r.correctCount) || 0;
  if (!(c <= a)) over++;
  if (a === 0) zeroAttempts++;
  const m = r.mastery;
  if (a > 0 && m != null && Math.abs(Number(m) - c / a) > 0.02) bad++;
}
console.log(`  correctCount > attempts（违反口径）：${over}`);
console.log(`  attempts = 0（空行）：${zeroAttempts}`);
console.log(`  mastery 与 correctCount/attempts 不符：${bad}`);
console.log(`  → 结论：${over === 0 && bad === 0 ? '✅ 线上数据自洽，符合 052 口径' : '⚠️ 有异常行，需人工看'}`);

show('⑤ 结论');
console.log(`
  改动依据判定：
    · 决策 060 状态 = ${ratified ? '已定稿' : '待审（未拍板）'}
    · 决策 060 是否进 decision-log = ${has060 ? '是' : '否'}
    · 代码实现（updateMastery 的 concept 分流 + kFormula 的 Σcorrect/Σattempts）符合 052

  → ${ratified && has060
    ? '060 已生效：应把 K 口径改到 060'
    : '060 未生效：K 的代码口径【不应改】。上一场会话那句「口径不对」的前提不成立。'}

  附：决策 060 自带的验证脚本 scripts/k-formula-compare.mjs 已跑，
      其结果反而【否定】了难度加权方案（困难层 0/2 时 K 仍 80.8%，未达它自己设的「应 < 0.6」目标）。
      两条独立证据都指向同一结论：先不动 K。
`);
