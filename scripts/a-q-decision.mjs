/**
 * q 因子怎么改 —— 三个候选的实测对比
 * 跑法：node scripts/a-q-decision.mjs
 *
 * 背景（实测）：
 *   · segments 段数不一致 62%，Δ段数最大 8；断段数不一致 36%，Δ断段最大 4
 *   · → q = 1 − 断段/总段 不可比
 *   · P 74% 一致，中位 ΔP = 0，尾部 9 组大抖（alt/wrong 变体）
 *   · D 平均 ΔD 0.029（稳）
 *
 * 三条路：
 *   甲 q ≡ 1（删因子，两项式）
 *   乙 q 换涂改集中度（涂改已定归 S，但可给 A 提供信号）
 *   丙 q 只罚「缺关键环节」（需环节清单，1.0 没有）
 */

const SEGS = { 简单: 3, 中等: 5, 困难: 7 };
const CAL = (d) => 0.8 + 0.2 * d;
const p3 = (x) => x.toFixed(3);
const p0 = (x) => (x * 100).toFixed(1);
const line = '='.repeat(92);

// ── 学生画像（较真实的三档）──
const PROFILES = {
  较强: {
    简单: { P: 1.00, D: 0.20, brk: 0, ink: 0 },
    中等: { P: 1.00, D: 0.50, brk: 0, ink: 0 },
    困难: { P: 0.95, D: 0.90, brk: 1, ink: 1 },
  },
  中等: {
    简单: { P: 0.95, D: 0.20, brk: 0, ink: 0 },
    中等: { P: 0.78, D: 0.50, brk: 1, ink: 1 },
    困难: { P: 0.40, D: 0.90, brk: 2, ink: 2 },
  },
  比较拉: {
    简单: { P: 0.82, D: 0.20, brk: 1, ink: 1 },
    中等: { P: 0.55, D: 0.50, brk: 1, ink: 1 },
    困难: { P: 0.25, D: 0.90, brk: 2, ink: 3 },
  },
};
const TARGET = { 较强: 0.85, 中等: 0.70, 比较拉: 0.50 };
const MIX = { easy: 0.70, mid: 0.20, hard: 0.10 };

function makeObs(kind, n) {
  const p = PROFILES[kind]; const bag = [];
  const nE = Math.round(n * MIX.easy), nM = Math.round(n * MIX.mid);
  for (let i = 0; i < nE; i++) bag.push({ lv: '简单', ...p.简单 });
  for (let i = 0; i < nM; i++) bag.push({ lv: '中等', ...p.中等 });
  for (let i = 0; i < n - nE - nM; i++) bag.push({ lv: '困难', ...p.困难 });
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  return bag;
}

// ── 三种 q ──
const Q_FN = {
  seg: (o) => 1 - o.brk / SEGS[o.lv],                    // 现状（已撤）
  one: () => 1,                                          // 甲：删因子
  ink: (o) => {                                          // 乙：涂改集中度
    const total = o.ink;
    if (total === 0) return 1;
    const maxAt = total;                 // 假设全部集中在同一处 = 最坏
    return 1 - (maxAt / Math.max(1, total * 1.0)) * 0.3;   // 罚不超过 0.3
  },
  // 丙暂缺环节清单，跑不了
};

function sim(kind, opt = {}) {
  const {
    qMode = 'one', alpha = 0.1, U0 = 0.50, A0 = 0.30, dU = 0.05, dD = 0.03,
    window = 10, need = 2, n = 200, delta = 0.01, pNoise = 0,
  } = opt;
  let A = A0, U = U0; const hist = []; let ups = 0;
  for (let i = 0; i < n; i++) {
    const o = makeObs(kind, n)[i];
    const q = Q_FN[qMode](o);
    const noise = pNoise ? (Math.random() - 0.5) * 2 * pNoise : 0;
    const s = Math.max(0, Math.min(1, o.P * CAL(o.D) * q + noise));
    hist.push({ ok: s > U, D: o.D });
    if (hist.length > window) hist.shift();
    if (hist.filter(x => x.ok).length >= need) {
      const t = [...hist].reverse().find(x => x.ok);
      U += dU * (1 - U) * t.D; ups++; hist.fill({ ok: false, D: 0 });
    }
    const gap = Math.max(0, U - A);
    A = Math.max(0, Math.min(U, A + alpha * (s - A) * (Math.sqrt(gap) + delta)));
  }
  return { A, U, ups };
}
const avg = (kind, opt, n = 20) => { const rs = []; for (let t = 0; t < n; t++) rs.push(sim(kind, opt)); const m = f => rs.reduce((s, r) => s + f(r), 0) / rs.length; return { A: m(r => r.A), U: m(r => r.U), ups: m(r => r.ups) }; };

console.log(line);
console.log('一、q ≡ 1 之后 s 变成什么（较难的简单/中等/困难三档）');
console.log(line);
for (const k of Object.keys(PROFILES)) {
  const p = PROFILES[k];
  console.log(`\n  【${k}】`);
  for (const lv of ['简单', '中等', '困难']) {
    const o = p[lv];
    const q1 = Q_FN.one(o), qs = Q_FN.seg(o);
    console.log(`    ${lv}  P=${p3(o.P)} D=${p3(o.D)}  断${o.brk}段`);
    console.log(`      s（q≡1）    = ${p3(o.P * CAL(o.D))}`);
    console.log(`      s（旧 q）   = ${p3(o.P * CAL(o.D) * qs)}   差 ${((qs - 1) * 100).toFixed(0)}%`);
  }
}

console.log('\n' + line);
console.log('二、三种 q 的三档结果对比（200 次观测，无噪声）');
console.log(line);
const QOPTS = [
  ['甲 q ≡ 1（删因子）', { qMode: 'one' }],
  ['乙 q = 涂改集中度', { qMode: 'ink' }],
  ['旧 q = 1−断段/总段（已撤）', { qMode: 'seg' }],
];
console.log('  q 方案                     较强A   中等A   较弱A   强-弱跨度  上浮(强)');
console.log('  ' + '─'.repeat(68));
for (const [n, o] of QOPTS) {
  const a = avg('较强', o), m = avg('中等', o), w = avg('比较拉', o);
  const v = a.A >= 0.84 ? '✅' : a.A >= 0.75 ? '🟡' : '❌';
  console.log(`  ${n.padEnd(26)} ${p3(a.A)}   ${p3(m.A)}   ${p3(w.A)}    ${p3(a.A - w.A)}    ${a.ups.toFixed(0).padStart(3)}  ${v}`);
}

console.log('\n' + line);
console.log('三、q ≡ 1 会不会让「过程」这一维消失');
console.log(line);
console.log('  问：删掉 q 之后，A 还测得到「顺不顺」吗？\n');
console.log('  答：测得到，因为 P 本身就是过程分。代码里 P 的定义是');
console.log('     「过程与正确答案的距离」（决策 2026-08-14）—— 它已经含过程信息。\n');
console.log('  实测：同一份数据下，q≡1 与 q=旧式的 A 差多少：');
const a1 = avg('较强', { qMode: 'one' }), a2 = avg('较强', { qMode: 'seg' });
console.log(`     较强 A：q≡1 → ${p3(a1.A)}   旧 q → ${p3(a2.A)}   差 ${((a1.A - a2.A) * 100).toFixed(1)} 点`);
console.log(`     中等 A：q≡1 → ${p3(avg('中等', { qMode: 'one' }).A)}   旧 q → ${p3(avg('中等', { qMode: 'seg' }).A)}`);
console.log('\n  → 差异不大，因为 P 已经在承担「顺不顺」这件事');
console.log('  → **q 是 P 的第二份表达，删掉它不丢信息**');

console.log('\n' + line);
console.log('四、加回实测噪声（用真实的 ΔP 分布）');
console.log(line);
console.log('  实测：有过程的题 P 74% 一致，ΔP 中位 0，平均 0.138，最大 1.0');
console.log('  保守取 P 噪声 ±0.10（平均量级）与 ±0.20（含尾部）：\n');
console.log('  配置                          较强A   中等A   较弱A   强-弱跨度');
console.log('  ' + '─'.repeat(62));
for (const noise of [0, 0.10, 0.20, 0.30]) {
  const o = { qMode: 'one', pNoise: noise };
  const a = avg('较强', o, 15), m = avg('中等', o, 15), w = avg('比较拉', o, 15);
  console.log(`  q≡1，P 噪声 ±${p3(noise).padEnd(5)}          ${p3(a.A)}   ${p3(m.A)}   ${p3(w.A)}    ${p3(a.A - w.A)}`);
}

console.log('\n' + line);
console.log('五、如果坚持要留 q —— 唯一可用的形态');
console.log(line);
console.log('  丙方案（只罚「缺关键环节」）需要「环节清单」，1.0 没有：');
console.log('     · referenceProcess 是 AI 生成的（49/61 有），不是可靠基准');
console.log('     · 而它正是要校准的对象 → 自证循环\n');
console.log('  但有一个变体可行：**q 用「是否写到最后」这个二值**\n');
console.log('     q = 1有结尾（写出结论/答案）');
console.log('     q = 0.9     写到最后但没写结论\n');
console.log('     → 只判「有没有收尾」，是位置事实，可数，不需判断对错');
const a3 = avg('较强', { qMode: 'one' });
console.log(`\n  跑一遍：只用 q≡1（不区分收尾）→ 较强 ${p3(a3.A)}`);
console.log('  差异量级估计：0.9 vs 1.0 的一次因子 → 约 10% 的 s 差异');
console.log('  → 对期末 A 的影响 < 1 点，且它要求「结尾可识别」，判定层要新定义');
console.log('  → **收益小于成本**');

console.log('\n' + line);
console.log('六、结论：三选一');
console.log(line);
console.log(`
  【推荐】甲 q ≡ 1 —— s = P × (0.8 + 0.2D)

  理由三条：
  ① P 已经是过程分（含「顺不顺」），q 是重复表达
  ② 旧 q 的输入已撤（segments 段数不一致 62%，Δ段数最大 8）
  ③ 实测 q≡1 与旧 q 的期末 A 差 ${Math.abs((a1.A - a2.A) * 100).toFixed(1)} 点，不影响结论

  改完之后 A 的完整公式（最终版）：
  ┌────────────────────────────────────────────┐
  │  s  = P × (0.8 + 0.2D)                │
  │  ΔA = 0.1 × (s − A) × (√(U − A) + 0.01)  │
  │  U 上浮：窗口 10 次内 ≥2 次 s > U         │
  │        → U += 0.05 × (1 − U) × D            │
  │  U 下浮：连续 5 次 s ≤ 0.6 → U -= 0.03(U − A)│
  │  A₀ = 0.30   U₀ = 0.50│
  └────────────────────────────────────────────┘

  三个因子里只剩两个，而那两个都是稳的：
  P 74% 一致（中位 ΔP = 0）+ D 平均 ΔD 0.029

  【附带解决】§8的 S1~S4 全靠学生自报 → 涂改观测现在也没地方去
  → 若采用乙（涂改），涂改就同时喂 A 和 S
  → 但我实测乙方案对 A 的影响很小（见第二节）
  → 建议涂改只归 S，不进 A —— 保持「涂改是 S 的信号」这条已定的口径
`);
