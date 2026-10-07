/**
 * U 的三种收尾形态 —— 回答「U 留着干嘛」
 *
 * 形态①（055 原版）：U 渐进上涨 + A 靠 (U−A) 空间因子逼近
 * 形态②（微改⑥）：  U = 历史最高 s（一步到位） + A 靠 (U−A) 逼近
 * 形态③（微改⑦）：  U = 历史最高 s + A 用纯 EWMA，只是被 U 封顶
 *
 * 跑法: node scripts/a-u-final-forms.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const p3 = (x) => (x * 100).toFixed(1).padStart(5);
const CAL = (d) => 0.6 + 0.4 * d;
const L = '='.repeat(98);
const S = '-'.repeat(98);
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const DIR = path.resolve(__dirname, '..', 'output', 'golden', 'results', 'stability-raw');

const seen = new Set(), rows = [];
for (const f of fs.readdirSync(DIR).sort()) {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  if (j.questionType !== '解答' || j.P == null || j.D == null) continue;
  const k = (j.questionText || '').slice(0, 60);
  if (seen.has(k)) continue; seen.add(k);
  rows.push(j);
}
const qOf = (j) => {
  const s = j.segments || [];
  if (!s.length) return 1;
  return 1 - s.filter((x) => x && x.status === '断').length / Math.max(1, s.length);
};

function engine(mode, alpha, skipBlank = true) {
  let A = 0.30, U = 0.50, hi = 0, n = 0, ups = 0;
  return {
    step(j) {
      if (skipBlank && j.processAvailable === false) return;
      const s = j.P * CAL(j.D);
      // U
      if (mode === '055') {
        if (s >= 0.8) { hi++; if (hi >= 2) { U += 0.05 * (1 - U); hi = 0; ups++; } } else hi = 0;
      } else {
        if (s > U) { U = s; ups++; }
      }
      // A
      if (mode === 'ewma') {
        A = A + alpha * (s - A);
        A = Math.max(0, Math.min(U, A));          // 只封顶，不加空间阻尼
      } else {
        A = Math.max(0, Math.min(U, A + alpha * (s - A) * (U - A)));
      }
      n++;
    },
    get A() { return A; }, get U() { return U; }, get n() { return n; }, get ups() { return ups; },
  };
}

console.log(L);
console.log('  一、作者 31 道题（22 道做了的）· 三种 U 形态');
console.log(L);
console.log('  形态                          │  期末A   │  期末U   │  A/U  │ A 离 U 还差');
console.log('  ' + S);
const FORMS = [
  ['055 原版（U 渐进 + 空间阻尼）', '055', 0.25],
  ['微改⑥（U=max s + 空间阻尼）', 'max', 0.25],
  ['微改⑥·α=0.4（空间阻尼调快）', 'max', 0.40],
  ['★微改⑦（U=max s + 纯EWMA）', 'ewma', 0.25],
  ['★微改⑦·α=0.15', 'ewma', 0.15],
];
for (const [nm, mode, al] of FORMS) {
  const e = engine(mode, al);
  for (const r of rows) e.step(r);
  console.log(`  ${nm.padEnd(28)} │ ${p3(e.A)}    │ ${p3(e.U)}    │ ${(e.A / e.U).toFixed(2)} │ ${p3(e.U - e.A)}`);
}

console.log('\n' + L);
console.log('  二、平台期测试：s 停在 0.70（300 次）→ 跳到 0.90（300 次）');
console.log(L);
console.log('  这才是「A 逼近 U → U 突破 → A 继续追」的形状');
console.log('');
console.log('    形态                   │ 第一段末 A    U   │ 第二段末 A    U   │ A 跟上了吗');
console.log('  ' + S);
for (const [nm, mode, al] of FORMS) {
  const e = engine(mode, al);
  for (let i = 0; i < 300; i++) e.step({ D: 0.65, P: 0.70, processAvailable: true });
  const a1 = e.A, u1 = e.U;
  for (let i = 0; i < 300; i++) e.step({ D: 0.65, P: 0.90, processAvailable: true });
  const follow = (e.A - a1) * 100;
  console.log(`    ${nm.padEnd(22)}│ ${p3(a1)}  ${p3(u1)}  │ ${p3(e.A)}  ${p3(e.U)}  │ ${follow.toFixed(1).padStart(5)} 点`);
}

console.log('\n' + L);
console.log('  三、观测数的影响（P=0.9, D=0.65，看 A 追到什么程度）');
console.log(L);
console.log('    观测数 │ 055原版 A    │ 微改⑥ A    U   │ ★微改⑦ A    U');
console.log('  ' + S);
for (const n of [5, 10, 20, 40, 80, 150, 300]) {
  const a = engine('055', 0.25), b = engine('max', 0.25), c = engine('ewma', 0.25);
  for (let i = 0; i < n; i++) { const j = { D: 0.65, P: 0.9, processAvailable: true }; a.step(j); b.step(j); c.step(j); }
  console.log(`    ${String(n).padStart(5)}  │ ${p3(a.A)}        │ ${p3(b.A)}  ${p3(b.U)}  │ ${p3(c.A)}  ${p3(c.U)}`);
}

console.log('\n' + L);
console.log('  四、五个场景（微改⑦ = U 取历史最高 s + A 用纯 EWMA 且被 U 封顶）');
console.log(L);
const mk = (D, P, pa = true) => ({ D, P, processAvailable: pa });
const cases = [
  ['稳定好学生：30 道全满分', Array.from({ length: 30 }, () => mk(0.65, 1.0))],
  ['稳定中等：30 道拿 0.6', Array.from({ length: 30 }, () => mk(0.65, 0.6))],
  ['单元只有 3 道题（全满分）', [mk(0.65, 1.0), mk(0.65, 1.0), mk(0.65, 1.0)]],
  ['先好后差：20 道满分 → 20 道 0.3', [...Array.from({ length: 20 }, () => mk(0.65, 1.0)), ...Array.from({ length: 20 }, () => mk(0.65, 0.3))]],
  ['含 10 道空题', [...Array.from({ length: 20 }, () => mk(0.65, 0.9)), ...Array.from({ length: 10 }, () => mk(0.65, 0, false))]],
  ['难题不会/简单题会（10×D0.85拿0.3 + 10×D0.5满分）', [...Array.from({ length: 10 }, () => mk(0.5, 1.0)), ...Array.from({ length: 10 }, () => mk(0.85, 0.3))]],
  ['难题会/简单题粗心（10×D0.85满分 + 10×D0.5拿0.4）', [...Array.from({ length: 10 }, () => mk(0.85, 1.0)), ...Array.from({ length: 10 }, () => mk(0.5, 0.4))]],
];
console.log('  场景                                  │ 微改⑥ A    U   │ ★微改⑦ A    U');
console.log('  ' + S);
for (const [label, list] of cases) {
  const b = engine('max', 0.25), c = engine('ewma', 0.25);
  for (const j of list) { b.step(j); c.step(j); }
  console.log(`  ${label.padEnd(38)}│ ${p3(b.A)}  ${p3(b.U)}  │ ${p3(c.A)}  ${p3(c.U)}`);
}
