/**
 * 「最初版（055）+ 微改」 vs 现行的 062 甲方案
 *
 * 用户质疑：「U 是留着干嘛的？现在的公式偏离了最初的目标，不如用最初版微改一下」
 *
 * 本脚本回答三件事：
 *   ① U 在公式里唯一的作用是什么（去掉它 / 保留它 差在哪）
 *   ② 最初版只改「上浮门槛」这一处，读数会变成什么
 *   ③ U 的涨幅速度如何决定 A 能到哪（结构性耦合）
 *
 * 跑法: node scripts/a-055-minimal-fix.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const p3 = (x) => (x == null ? '  — ' : (x * 100).toFixed(1).padStart(5));
const CAL = (d) => 0.6 + 0.4 * d;
const L = '='.repeat(102);
const S = '-'.repeat(102);
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

// ───────────────────────── 公式族 ─────────────────────────
function makeEngine(cfg) {
  let A = 0.30, U = 0.50, hi = 0, lo = 0, n = 0, ups = 0, downs = 0, skipped = 0;
  let W = 1, Sum = 0.30;
  return {
    cfg,
    step(j) {
      // ── 062 甲方案：难度当权重 + 累计加权平均 ──
      if (cfg.useWeight) {
        if (j.processAvailable === false) { skipped++; return; }
        const w = j.D >= 0.94 ? 0 : j.D;
        if (!w) { skipped++; return; }
        const s = j.P;
        if (s > U) { hi++; if (hi >= 2) { U += cfg.deltaU * (1 - U); hi = 0; ups++; } } else hi = 0;
        W += w; Sum += w * s; A = Sum / W; n++;
        return;
      }

      // ── 055 家族 ──
      if (cfg.skipBlank && j.processAvailable === false) { skipped++; return; }
      if (cfg.gateSkill && j.errorLevel === 'skill') { skipped++; return; }
      const q = cfg.keepQ ? qOf(j) : 1;
      const s = j.P * CAL(j.D) * q;
      if (s <= 0 && j.processAvailable === false && cfg.skipBlank === undefined) { /* 055 原版计入空题 */ }

      if (cfg.gate === 'abs80') {
        if (s >= 0.8) { hi++; lo = 0; } else hi = 0;
        if (s <= 0.6) lo++; else lo = 0;
        if (hi >= 2) { U += cfg.deltaU * (1 - U); hi = 0; ups++; }
        if (lo >= 5) { U -= 0.03 * (U - A); lo = 0; downs++; }
      } else if (cfg.gate === 'rel1') {
        if (s > U) { U += cfg.deltaU * (1 - U); ups++; }
      } else if (cfg.gate === 'rel2') {
        if (s > U) { hi++; if (hi >= 2) { U += cfg.deltaU * (1 - U); hi = 0; ups++; } } else hi = 0;
      } else if (cfg.gate === 'max') {
        if (s > U) { U = s; ups++; }
      }

      const space = cfg.sqrt ? Math.sqrt(Math.max(0, U - A)) + 0.01 : (U - A);
      const dA = cfg.alpha * (s - A) * space;
      A = Math.max(0, Math.min(cfg.clampToU === false ? 1 : U, A + dA));
      n++;
    },
    get A() { return A; }, get U() { return U; }, get n() { return n; },
    get info() {
      return this.cfg.useWeight ? `上浮${ups} 跳过${skipped}` : `上浮${ups} 下浮${downs} 跳过${skipped}`;
    },
  };
}

// ───────────────────────── 一、作者真实数据 ─────────────────────────
console.log(L);
console.log('  一、同一批 31 道题（22 道做了的 · 9 道空题）· 各版本落点');
console.log(L);
const VERSIONS = [
  ['055 原版（线上跑的就是它）',     { keepQ: 1, gate: 'abs80', alpha: 0.25, deltaU: 0.05, gateSkill: 1 }],
  ['055 原版·去掉 skill 闸门',      { keepQ: 1, gate: 'abs80', alpha: 0.25, deltaU: 0.05 }],
  ['微改①：删 q，门槛改 s>U 连续2',   { keepQ: 0, gate: 'rel2', alpha: 0.25, deltaU: 0.05 }],
  ['微改②：①+门槛改 s>U 单次',       { keepQ: 0, gate: 'rel1', alpha: 0.25, deltaU: 0.05 }],
  ['微改③：②+跳空题',              { keepQ: 0, gate: 'rel1', alpha: 0.25, deltaU: 0.05, skipBlank: 1 }],
  ['微改④：③+α 降到 0.1',          { keepQ: 0, gate: 'rel1', alpha: 0.10, deltaU: 0.05, skipBlank: 1 }],
  ['微改⑤：④+δᵤ 提到 0.20',        { keepQ: 0, gate: 'rel1', alpha: 0.10, deltaU: 0.20, skipBlank: 1 }],
  ['062 甲方案（现行讨论）',         { useWeight: 1, deltaU: 0.05 }],
];
console.log('  版本                            │  期末 A  │  期末 U  │  A/U  │ 备注');
console.log('  ' + S);
for (const [name, cfg] of VERSIONS) {
  const e = makeEngine(cfg);
  for (const r of rows) e.step(r);
  console.log(`  ${name.padEnd(30)} │ ${p3(e.A)}   │ ${p3(e.U)}   │ ${(e.A / e.U).toFixed(2)} │ ${e.info}`);
}
console.log(`\n  目标：课内较强 ≈ ${target_display()}`);

function target_display() { return '0.85'; }

// ───────────────────────── 二、U 有什么作用 ─────────────────────────
console.log('\n' + L);
console.log('  二、U 到底在干什么 —— 把 A 公式里那个 (U−A) 因子拿掉试一次');
console.log(L);
console.log('  学生阶梯式进步（P 从 0.60 爬到 0.95，每 200 次抬一档，题固定 D=0.65）');
console.log('');
console.log('    阶段     s     │ 有 U（保留天花板）       │ 无 U（纯 EWMA）');
console.log('                    │  A      U     本档涨幅    │  A      本档涨幅');
console.log('  ' + S);
{
  const mk = (P) => ({ D: 0.65, P, processAvailable: true });
  const withU = makeEngine({ keepQ: 0, gate: 'rel1', alpha: 0.25, deltaU: 0.05 });
  let noU = 0.30;
  for (let st = 0; st < 7; st++) {
    const P = 0.60 + st * 0.05, s = P * CAL(0.65);
    const a0 = withU.A, b0 = noU;
    for (let i = 0; i < 200; i++) { withU.step(mk(P)); noU = noU + 0.25 * (s - noU); }
    console.log(`    P=${P.toFixed(2)}  ${s.toFixed(3)} │ ${p3(withU.A)}  ${p3(withU.U)}  ${((withU.A - a0) * 100).toFixed(1).padStart(5)} 点 │ ${p3(noU)}  ${((noU - b0) * 100).toFixed(1).padStart(5)} 点`);
  }
}
console.log('');
console.log('  → 最终值几乎一样。差别在节奏：有 U 时前期快、接近 U 时慢 → 形成平台期');
console.log('    而「突破」这个概念必须有 U 才存在（U 抬升 → A 又有空间 → 继续涨）');

// ───────────────────────── 三、U 涨幅决定 A 能到哪 ─────────────────────────
console.log('\n' + L);
console.log('  三、🔴 A 的读数被 U 的涨幅卡住 —— 观测少的学生吃亏');
console.log(L);
console.log('  A ≤ U 是硬约束，而 U 是渐进上涨的，需要足够多次触发才到位');
console.log('');
console.log('  U 从 0.50 起步，每次 ×δᵤ(1−U)，触发 n 次后 U 到哪：');
console.log('    δᵤ=0.05   n=  5 → ' + p3(1 - 0.5 * Math.pow(0.95, 5)) + '   n= 10 → ' + p3(1 - 0.5 * Math.pow(0.95, 10)) + '   n= 20 → ' + p3(1 - 0.5 * Math.pow(0.95, 20)) + '   n= 50 → ' + p3(1 - 0.5 * Math.pow(0.95, 50)));
console.log('    δᵤ=0.20   n=  5 → ' + p3(1 - 0.5 * Math.pow(0.8, 5)) + '   n= 10 → ' + p3(1 - 0.5 * Math.pow(0.8, 10)) + '   n= 20 → ' + p3(1 - 0.5 * Math.pow(0.8, 20)) + '   n= 50 → ' + p3(1 - 0.5 * Math.pow(0.8, 50)));
console.log('');
console.log('  δᵤ 与落点（作者 22 道做了的题 + 恒定 P=0.9 一百道）：');
console.log('    δᵤ     作者A   作者U   │ 恒定P=0.9×100: A     U');
console.log('  ' + S);
for (const du of [0.05, 0.10, 0.20, 0.30]) {
  const e1 = makeEngine({ keepQ: 0, gate: 'rel1', alpha: 0.25, deltaU: du, skipBlank: 1 });
  for (const r of rows) e1.step(r);
  const e2 = makeEngine({ keepQ: 0, gate: 'rel1', alpha: 0.25, deltaU: du, skipBlank: 1 });
  for (let i = 0; i < 100; i++) e2.step({ D: 0.65, P: 0.9, processAvailable: true });
  console.log(`    ${du.toFixed(2)}   ${p3(e1.A)}   ${p3(e1.U)}   │                ${p3(e2.A)}  ${p3(e2.U)}`);
}

// ───────────────────────── 四、场景检验 ─────────────────────────
console.log('\n' + L);
console.log('  四、场景检验：微改③（删q+s>U单次+跳空题+α0.25） vs 062 甲方案');
console.log(L);
const mk = (D, P, pa = true) => ({ D, P, processAvailable: pa });
const E_FIX = () => makeEngine({ keepQ: 0, gate: 'rel1', alpha: 0.25, deltaU: 0.05, skipBlank: 1 });
const E_062 = () => makeEngine({ useWeight: 1, deltaU: 0.05 });
const cases = [
  ['稳定好学生：30 道 D=0.65 全满分', Array.from({ length: 30 }, () => mk(0.65, 1.0))],
  ['稳定中等：30 道 D=0.65 拿 0.6', Array.from({ length: 30 }, () => mk(0.65, 0.6))],
  ['单元只有 3 道题（全满分）', [mk(0.65, 1.0), mk(0.65, 1.0), mk(0.65, 1.0)]],
  ['先好后差：20 道满分 → 20 道 0.3', [...Array.from({ length: 20 }, () => mk(0.65, 1.0)), ...Array.from({ length: 20 }, () => mk(0.65, 0.3))]],
  ['含 10 道空题（20 道 0.9 + 10 道没作答）', [...Array.from({ length: 20 }, () => mk(0.65, 0.9)), ...Array.from({ length: 10 }, () => mk(0.65, 0, false))]],
  ['难题行/简单题差（10×D0.85满分 + 10×D0.5拿0.4）', [...Array.from({ length: 10 }, () => mk(0.85, 1.0)), ...Array.from({ length: 10 }, () => mk(0.5, 0.4))]],
  ['只会简单题（10×D0.5满分 + 10×D0.85拿0.3）', [...Array.from({ length: 10 }, () => mk(0.5, 1.0)), ...Array.from({ length: 10 }, () => mk(0.85, 0.3))]],
];
console.log('  场景                                      │ 微改③: A     U    │ 062甲: A     U');
console.log('  ' + S);
for (const [label, list] of cases) {
  const a = E_FIX(), b = E_062();
  for (const j of list) { a.step(j); b.step(j); }
  console.log(`  ${label.padEnd(42)}│      ${p3(a.A)}  ${p3(a.U)}  │      ${p3(b.A)}  ${p3(b.U)}`);
}

// ───────────────────────── 五、观测数曲线 ─────────────────────────
console.log('\n' + L);
console.log('  五、同一水平（P=0.9, D=0.65），A 需要几次观测才到位');
console.log(L);
console.log('    观测数 │ 微改③ A      U     │ 062甲 A');
console.log('  ' + S);
for (const n of [5, 10, 20, 40, 80, 150, 300]) {
  const a = E_FIX(), b = E_062();
  for (let i = 0; i < n; i++) { const j = mk(0.65, 0.9); a.step(j); b.step(j); }
  console.log(`    ${String(n).padStart(5)}  │ ${p3(a.A)}  ${p3(a.U)}  │ ${p3(b.A)}`);
}
console.log('');
console.log('  → 微改③ 在 150 次以后才追上 062；观测少时它偏低（U 还没涨够）');

// ───────────────────────── 六、U 的另一种实现：U = 历史最高 s ─────────────────────────
console.log('\n' + L);
console.log('  六、如果问题出在「U 涨得太慢」，那 U 直接取历史最高 s 会怎样');
console.log(L);
console.log('  改动只有一行：U 不再逐次 +0.05(1−U)，而是 U = max(历史 s)');
console.log('  保留了 U 的约束作用，但让它「一步到位」');
console.log('');
console.log('  版本                              │  作者A   作者U  │ 稳定好学生30道满分 A    U');
console.log('  ' + S);
{
  const mk = (D, P, pa = true) => ({ D, P, processAvailable: pa });
  const variants = [
    ['055 原版（绝对门槛 0.8）', { keepQ: 1, gate: 'abs80', alpha: 0.25, deltaU: 0.05, gateSkill: 1 }],
    ['微改③（s>U 单次触发）', { keepQ: 0, gate: 'rel1', alpha: 0.25, deltaU: 0.05, skipBlank: 1 }],
    ['★微改⑥：U = 历史最高 s', { keepQ: 0, gate: 'max', alpha: 0.25, skipBlank: 1 }],
    ['★微改⑥b：同上但 α=0.15', { keepQ: 0, gate: 'max', alpha: 0.15, skipBlank: 1 }],
    ['062 甲方案（对照）', { useWeight: 1, deltaU: 0.05 }],
  ];
  for (const [nm, cfg] of variants) {
    const e1 = makeEngine(cfg);
    for (const r of rows) e1.step(r);
    const e2 = makeEngine(cfg);
    for (let i = 0; i < 30; i++) e2.step(mk(0.65, 1.0));
    console.log(`  ${nm.padEnd(32)} │ ${p3(e1.A)}  ${p3(e1.U)}  │            ${p3(e2.A)}  ${p3(e2.U)}`);
  }
}

console.log('\n  平台期测试：s 长期停在 0.70（300 次），然后跳到 0.90（300 次）');
console.log('  这才是「A 逼近 U → U 突破 → A 继续追」要看的形状');
console.log('');
console.log('    阶段                │ 055原版 A    U   │ 微改⑥ U=max(s) A    U   │ 062甲 A    U');
console.log('  ' + S);
{
  const mk = (D, P, pa = true) => ({ D, P, processAvailable: pa });
  const D = 0.65;
  const mkP = (P) => ({ D, P, processAvailable: true });
  const e1 = makeEngine({ keepQ: 1, gate: 'abs80', alpha: 0.25, deltaU: 0.05, gateSkill: 1 });
  const e6 = makeEngine({ keepQ: 0, gate: 'max', alpha: 0.25, skipBlank: 1 });
  const e7 = makeEngine({ useWeight: 1, deltaU: 0.05 });
  for (const [label, P, times] of [['前 300 次 s≈0.70', 0.70, 300], ['后 300 次跳到 s≈0.90', 0.90, 300]]) {
    for (let i = 0; i < times; i++) { const j = mkP(P); e1.step(j); e6.step(j); e7.step(j); }
    console.log(`    ${label.padEnd(22)}│ ${p3(e1.A)}  ${p3(e1.U)}  │          ${p3(e6.A)}  ${p3(e6.U)}  │    ${p3(e7.A)}  ${p3(e7.U)}`);
  }
}
console.log('');
console.log('  → 055 原版：s=0.70 时触不到 0.8 门槛 → U 冻在 0.50 → A 也冻住');
console.log('  → 微改⑥ U=max(s)：第一段 U 立刻到 0.70，A 逼近它；第二段 U 跳到 0.90，A 立刻有新空间继续涨');
console.log('    —— 这就是「U 突破之后 A 继续不断逼近 U」的形状，而且不需要等 20 次触发');

