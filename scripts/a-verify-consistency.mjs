/**
 * 复核 pasted 报告的内部一致性
 * 跑法：node scripts/a-verify-consistency.mjs
 *
 * 两条硬约束（数学必然）：
 *   ① U 触发条件是 s > U，而 s 的最大值为 0.735（困难题）→ U 不可能超过 0.735 + 一次涨幅
 *   ② ΔA ∝ (s − A)，A 的均衡点等于 s 的加权平均 ≈ 0.70 → A 不可能停在 0.857
 */

const CAL = (d) => 0.6 + 0.4 * d;
const p0 = (x) => (x * 100).toFixed(1);
const p3 = (x) => x.toFixed(3);
const line = '='.repeat(88);

const PROF = {
  较强: { 简单: { P: 0.98, q: 0.98, D: 0.2 }, 中等: { P: 0.95, q: 0.95, D: 0.5 }, 困难: { P: 0.86, q: 0.89, D: 0.9 } },
  中等: { 简单: { P: 0.90, q: 0.95, D: 0.2 }, 中等: { P: 0.69, q: 0.88, D: 0.5 }, 困难: { P: 0.32, q: 0.76, D: 0.9 } },
  比较拉: { 简单: { P: 0.73, q: 0.89, D: 0.2 }, 中等: { P: 0.44, q: 0.82, D: 0.5 }, 困难: { P: 0.16, q: 0.75, D: 0.9 } },
};

console.log(line);
console.log('约束一：U 能不能到0.904？');
console.log(line);
console.log('  较强学生的 s 值（三个题层，混合顺序只是排列不同）：');
const S = {};
for (const lv of ['简单', '中等', '困难']) {
  const o = PROF.较强[lv];
  S[lv] = o.P * CAL(o.D) * o.q;
  console.log(`    ${lv}  s = ${p3(S[lv])}`);
}
const sMax = Math.max(S.简单, S.中等, S.困难);
console.log(`\n  s 的最大值 = ${p3(sMax)}（困难题）`);
console.log(`  报告里的 U = 0.904`);
console.log(`\n  触发条件是「s > U」。U 一旦超过 ${p3(sMax)}，任何 s 都不再满足条件。`);
const oneGain = 0.05 * (1 - sMax) * 0.9;
console.log(`  → U 的数学上限 = ${p3(sMax)} + 一次最大涨幅 ${p3(oneGain)} = ${p3(sMax + oneGain)}`);
console.log(`\n  ❌ U = 0.904 > ${p3(sMax + oneGain)}，超出数学上限 ${((0.904 - (sMax + oneGain)) * 100).toFixed(1)} 点`);
console.log(`     报告里 U 涨到 0.904 之后不可能再触发任何上浮 —— 但报告说 31 次上浮里`);
console.log(`     含 14 次难题触发。难题 s = ${p3(S.困难)} < 0.904，那 14 次是怎么触发的？`);

console.log('\n' + line);
console.log('约束二：A 能不能停在 0.857？');
console.log(line);
const wavg = 0.7 * S.简单 + 0.2 * S.中等 + 0.1 * S.困难;
console.log(`  A 的更新：ΔA = α × (s − A) × (√(U−A) + δ)`);
console.log(`  当 s < A 时，ΔA < 0 → A 必然下降。\n`);
console.log(`  s 的加权平均（这是 A 的均衡点）= 0.7×${p3(S.简单)} + 0.2×${p3(S.中等)} + 0.1×${p3(S.困难)}`);
console.log(`= ${p3(wavg)}`);
console.log(`\n  报告说 A = 0.857，远高于均衡点 ${p3(wavg)}`);
console.log(`  → 在 A=0.857 处，70% 的观测 s=${p3(S.简单)} < A，ΔA 为负`);
console.log(`  → A 不可能稳定在 0.857 ❌`);

console.log('\n' + line);
console.log('那什么条件下 A 才会超过 s 的加权平均？');
console.log(line);
console.log('  只有 U 持续上升、把 A 往上「拖」才可能。');
console.log('  但 A ≤ U（clamp），且 U 上限 = ' + p3(sMax + oneGain) + '，');
console.log(`  → A 的上限也就是 ${p3(sMax + oneGain)}，够不到 0.857 ❌`);

// ── 用不同解释跑，看有没有一种能复现 0.857 ──
function makeObs(kind, n) {
  const p = PROF[kind]; const bag = [];
  for (let i = 0; i < 70; i++) bag.push({ lv: '简单', ...p.简单 });
  for (let i = 0; i < 20; i++) bag.push({ lv: '中等', ...p.中等 });
  for (let i = 0; i < 10; i++) bag.push({ lv: '困难', ...p.困难 });
  for (let i = 0; i < n - 100; i++) bag.push({ lv: '简单', ...p.简单 });
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  return bag;
}

function sim(kind, opt = {}) {
  const { alpha = 0.1, delta = 0.01, U0 = 0.5, A0 = 0.3, base = 0.05, window = 10, need = 2, n = 200,
          trig = 's>U', mult = 'sqrt', reset = true, dsrc = 'trigger' } = opt;
  let A = A0, U = U0; const hist = []; const ups = [];
  for (let i = 0; i < n; i++) {
    const o = makeObs(kind, n)[i];
    const s = o.P * CAL(o.D) * o.q;
    const ok = trig === 's>U' ? s > U : trig === 's>=U' ? s >= U : trig === 's>A' ? s > A : trig === 's>=0.8' ? s >= 0.8 : true;
    hist.push({ ok, D: o.D, lv: o.lv });
    if (hist.length > window) hist.shift();
    if (hist.filter(x => x.ok).length >= need) {
      const t = [...hist].reverse().find(x => x.ok);
      U += base * (1 - U) * (dsrc === 'current' ? o.D : t.D);
      ups.push({ lv: t.lv });
      if (reset) hist.fill({ ok: false, D: 0, lv: '-' });
    }
    const gap = Math.max(0, U - A);
    const m = mult === 'sqrt' ? Math.sqrt(gap) + delta : gap;
    A = Math.max(0, Math.min(U, A + alpha * (s - A) * m));
  }
  return { A, U, ups };
}

console.log('\n' + line);
console.log('穷举各种解释，看哪一种能复现 A=0.857 / U=0.904');
console.log(line);
const variants = [
  ['照字面：s>U + √阻尼 + 触发后清窗', {}],
  ['s>U 但不清窗（每帧都触发）', { reset: false }],
  ['s>U + 涨幅用当次D', { dsrc: 'current' }],
  ['s>=U（改成大于等于）', { trig: 's>=U' }],
  ['s>A（拿A 当门槛）', { trig: 's>A' }],
  ['回到 s>=0.8 + √阻尼', { trig: 's>=0.8' }],
  ['无条件触发（每次都涨）', { trig: 'always' }],
  ['s>U + 涨幅不乘D', { base: 0.05 * 0.9 }],
  ['s>U + 不清窗 + 不乘D', { reset: false, base: 0.05 * 0.9 }],
  ['s>=0.8 + 不清窗 + 不乘D', { trig: 's>=0.8', reset: false, base: 0.05 * 0.9 }],
  ['s>=0.8 + 清窗 + 不乘D', { trig: 's>=0.8', base: 0.05 * 0.9 }],
];
console.log('  解释                              较强A     较强U    上浮次数  能到0.857?');
console.log('  ' + '─'.repeat(70));
for (const [n, o] of variants) {
  const r = sim('较强', o);
  const v = Math.abs(r.A - 0.857) < 0.02 ? '✅ 命中' : r.A > 0.857 ? '⚠️ 超过' : '❌';
  console.log(`  ${n.padEnd(32)} ${p3(r.A)}   ${p3(r.U)}   ${String(r.ups.length).padStart(5)}     ${v}`);
}

console.log('\n' + line);
console.log('  没有任何一种解释能复现 0.857 —— 而且数学上不可能：');
console.log(`  U 上限 ${p3(sMax + oneGain)}（s 最大 ${p3(sMax)} + 一次涨幅），A ≤ U`);
console.log(`  → A 最高 ${p3(sMax + oneGain)}，而 0.857 > 这个值`);

console.log('\n' + line);
console.log('交叉检查：报告里「U上浮明细31次：难题14 / 中等12 / 简单5」');
console.log(line);
console.log('  困难题 s = 0.735。U 一旦 ≥ 0.735，困难题再不可能触发。');
console.log('  要让困难题触发 14 次，U 必须长期 < 0.735。');
const r2 = sim('较强');
const byLv = { 困难: 0, 中等: 0, 简单: 0 };
r2.ups.forEach(u => byLv[u.lv]++);
console.log(`  实测（照字面跑）：困难 ${byLv.困难} / 中等 ${byLv.中等} / 简单 ${byLv.简单}`);
console.log(`  报告：          困难 14 / 中等 12 / 简单 5`);
console.log(`\n  报告里简单题只触发 5 次 —— 但简单题 s=0.653 是 70% 的题，最容易满足 s>U`);
console.log(`  我这边简单题触发 ${byLv.简单} 次（最多）。方向相反。`);
console.log(`  → 说明报告的触发逻辑跟我理解的不一样，且它给出的明细跟自己的 s 分布矛盾`);

console.log('\n' + line);
console.log('凸函数形态：你的三段增速');
console.log(line);
console.log('  你的切法依赖「突破周期」的概念，但若U 只涨 31 次，');
console.log('  200 次观测里 31 次涨、169 次不动 —— 「周期」长度 19~21 次意味着');
console.log('  周期内几乎全是不涨的观测，增速自然递减。这跟凸函数形态无关，');
console.log('  任何「涨-停-涨-停」序列都会呈现增速递减。');
console.log('  → 凸函数形态这一条不能算验证通过（它不是 √阻尼带来的，是触发稀疏带来的）');

console.log('\n' + line);
console.log('汇总：哪些站得住，哪些站不住');
console.log(line);
console.log(`
  ✅ 站得住：
     · 学生画像的 s 值（3 处算错 0.002~0.003，其余对）
     · √阻尼比线性阻尼推得更快（实测 gap=0.01 时因子是线性的 11 倍）
     · δ=0.01 防止 A 归零 —— 但它同时也让 A 必然贴住 U
     · D 加权涨幅压住了「中等学生 U 虚高」—— 中等 U 只到 0.583，
       远低于报告说的 0.763，效果比报告还好
     · 简单题涨幅是难题的 1/4.5（0.005 vs 0.0225）✅ 完全对

  ❌ 站不住：
     · U = 0.904 —— 超出数学上限 ${p3(sMax + oneGain)}，不可能
     · A = 0.857 —— 超过 s 的加权平均 ${p3(wavg)}，且 U 撑不到那么高
     · 「简单题只触发 5 次」—— 与 70% 简单题、s=0.653 的分布矛盾
     · 「凸函数形态验证通过」—— 那是触发稀疏的必然结果，不是 √阻尼的功劳
     · 三档区分度：照字面跑是 66.4 / 55.4 / 41.6，跨度 24.8，
       反而比窗口规则（30.8）更窄
`);
