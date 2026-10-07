/**
 * 修正数据：按「较强学生」真实形态重造100 道
 * 跑法：node scripts/a-strong-realistic.mjs
 *
 * 上一版数据的问题（用户指出）：
 *   ① 70 道简单题全部排在最前 → A 在前 70 道就被 U₀=0.50 钉死，(U−A)→0
 *   2. 难题全排在最后且只有 10 道 → 「连续 2 次」几乎凑不齐
 *   3. 难题给 P=0.9 断=1 → 那是「做对但磕巴」，不是「做对一道难题」
 *
 * 这一版：混合排序 + 强学生难题 P=1.0 断=0（真的做出来了）
 */

const CAL = (d) => 0.6 + 0.4 * d;
const p0 = (x) => (x * 100).toFixed(1);
const line = '='.repeat(80);

function simulate(profile, opt = {}) {
  const { th = 0.8, alpha = 0.25, U0 = 0.5, deltaU = 0.05, streak = 2, segsOf } = opt;
  const A0 = 0.30;
  let A = A0, U = U0, hi = 0, lo = 0;
  const ups = [], downs = [], log = [];
  profile.forEach((o, i) => {
    const segs = segsOf ? segsOf(o) : 7;
    const q = o.brk === null || o.brk === undefined ? 1 : (segs > 0 ? 1 - o.brk / segs : 1);
    const s = o.P * CAL(o.D) * q;
    const bU = U, bA = A;
    if (s >= th) hi++; else hi = 0;
    if (hi >= streak) { U += deltaU * (1 - U); ups.push({ n: i + 1, lv: o.lv, s, U: bU, to: U }); hi = 0; }
    if (s <= 0.6) { lo++; if (lo >= 5) { U -= 0.03 * (U - A); downs.push({ n: i + 1, lv: o.lv, s, U: bU, to: U }); lo = 0; } } else lo = 0;
    A = Math.max(0, Math.min(U, A + alpha * (s - A) * (U - A)));
    log.push({ n: i + 1, lv: o.lv, s, A, U, dA: A - bA, dU: U - bU });
  });
  return { A, U, ups, downs, log };
}

// ── 真实难度配比：简单 70 / 中等 20 / 困难 10，但顺序打散 ──
function makeProfile(kind) {
  const bag = [];
  // 简单题 70：强学生几乎全对，偶有磕巴
  for (let i = 0; i < 70; i++) {
    const r = Math.random();
    if (kind === '强')      bag.push({ lv: '简单', D: 0.2, P: r < 0.92 ? 1.0 : 0.9, brk: r < 0.92 ? 0 : 1 });
    else if (kind === '中') bag.push({ lv: '简单', D: 0.2, P: r < 0.80 ? 1.0 : r < 0.95 ? 0.8 : 0.5, brk: r < 0.80 ? 0 : r < 0.95 ? 1 : 2 });
    else                    bag.push({ lv: '简单', D: 0.2, P: r < 0.65 ? 1.0 : r < 0.90 ? 0.8 : 0.4, brk: r < 0.65 ? 0 : r < 0.90 ? 1 : 2 });
  }
  for (let i = 0; i < 20; i++) {
    const r = Math.random();
    if (kind === '强')      bag.push({ lv: '中等', D: 0.5, P: r < 0.85 ? 1.0 : 0.9, brk: r < 0.85 ? 0 : 1 });
    else if (kind === '中') bag.push({ lv: '中等', D: 0.5, P: r < 0.50 ? 1.0 : r < 0.85 ? 0.7 : 0.4, brk: r < 0.50 ? 0 : r < 0.85 ? 2 : 4 });
    else                    bag.push({ lv: '中等', D: 0.5, P: r < 0.20 ? 1.0 : r < 0.60 ? 0.6 : 0.2, brk: r < 0.20 ? 0 : r < 0.60 ? 3 : 4 });
  }
  for (let i = 0; i < 10; i++) {
    const r = Math.random();
    if (kind === '强')      bag.push({ lv: '困难', D: 0.85, P: r < 0.50 ? 1.0 : 0.9, brk: r < 0.50 ? 0 : 1 });
    else if (kind === '中') bag.push({ lv: '困难', D: 0.85, P: r < 0.15 ? 1.0 : r < 0.45 ? 0.6 : 0.3, brk: r < 0.15 ? 0 : 2 });
    else                    bag.push({ lv: '困难', D: 0.85, P: r < 0.05 ? 0.8 : 0.2, brk: 2 });
  }
  // 洗牌 —— 真实做题顺序是混合的，不是按难度分层
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

const KIND = { 强: '较强（难题真做出来）', 中: '中等', 弱: '比较拉' };

console.log(line);
console.log('修正后的100 道：混合顺序（不是简单→中→难分层）');
console.log(line);
console.log('  α=0.25  U₀=0.50  门槛 s≥0.8 两连  δᵤ=0.05  段数按难度 3/5/7\n');

for (const kind of ['强', '中', '弱']) {
  const runs = [];
  for (let t = 0; t < 40; t++) runs.push(simulate(makeProfile(kind)));
  const avg = (f) => runs.reduce((s, r) => s + f(r), 0) / runs.length;
  const A = avg(r => r.A), U = avg(r => r.U), ups = avg(r => r.ups.length);
  const hardUps = runs.reduce((s, r) => s + r.ups.filter(x => x.lv === '困难').length, 0) / runs.length;
  const midUps = runs.reduce((s, r) => s + r.ups.filter(x => x.lv === '中等').length, 0) / runs.length;
  const easyUps = runs.reduce((s, r) => s + r.ups.filter(x => x.lv === '简单').length, 0) / runs.length;
  const target = kind === '强' ? 0.85 : kind === '中' ? 0.60 : 0.40;
  console.log(`  ${KIND[kind].padEnd(20)} A=${p0(A).padStart(5)}  U=${p0(U).padStart(5)}  上浮 ${ups.toFixed(1).padStart(4)} 次`);
  console.log(`  ${''.padEnd(20)} 上浮来源：简单 ${easyUps.toFixed(1)} / 中等 ${midUps.toFixed(1)} / 困难 ${hardUps.toFixed(1)}`);
  console.log(`  ${''.padEnd(20)} 你的基准 ${target} → 差 ${((target - A) * 100).toFixed(1)} 点 ${Math.abs(target - A) < 0.06 ? '✅' : '🟡'}\n`);
}

console.log(line);
console.log('关键验证：较强学生做对一道难题（s=0.94）时，机制怎么反应');
console.log(line);
const segsOf = (o) => ({ 简单: 3, 中等: 5, 困难: 7 })[o.lv];
const probe = [];
for (let i = 0; i < 69; i++) probe.push({ lv: '简单', D: 0.2, P: 1.0, brk: 0 });
probe.push({ lv: '困难', D: 0.85, P: 1.0, brk: 0 });   // 第70 题：难题做对
const r1 = simulate(probe, { segsOf });
console.log(`
  设定：前 69 道简单题全对，把 A 顶到接近 U₀=0.50
        第 70 道是难题，P=1.0 断=0 → s = 1.0 × 0.940 × 1.0 = 0.940
`);
console.log('  第 68~70 题逐题变化：');
for (const e of r1.log.slice(-3)) {
  console.log(`    第${e.n}题 ${e.lv}  s=${e.s.toFixed(3)}→  A ${(e.A - e.dA * 100).toFixed(1)}→${p0(e.A)}  (ΔA=${(e.dA * 100 >= 0 ? '+' : '')}${(e.dA * 100).toFixed(2)})  U=${p0(e.U)}  (ΔU=${(e.dU * 100).toFixed(2)})`);
}
console.log(`
  读法：ΔU = 0 是因为「连续 2 次」还不够（只做对 1 道）。
        机制本身是通的 —— 只要第 71 题再做对一道难题，U 就会动。
`);

console.log(line);
console.log('那为什么上一版跑不出这个效果？—— 三个数据缺陷');
console.log(line);
console.log(`
  缺陷1：顺序分层
     上一版 70 简单 → 20 中 → 10 难。简单题排在最前，
     A 从 0.30 涨到 0.496 就撞上 U₀=0.50 停住，
     之后 30 道题全程 (U−A) < 0.004 → 几乎不更新。
     真实做题是混合的，A 会有起伏空间。

  缺陷2：难题给得太保守
     上一版给「较强」的难题是 P=0.9 断=1 → s=0.725。
     用户说的「万一做对一道」应该是 P=1.0 断=0 → s=0.940 ≥ 0.8 ✅
     差别在q：断 1 段就掉 0.143，7 段题里断 1 段很常见。

  缺陷3：连续 2 次的门槛在 10 道难题里很难凑齐
     10 道难题随机排列，要连续两道都 P≥0.9 断≤1，概率不高。
     而中档题 20 道、简单题 70 道，达标率更高 → 上浮全被它们抢走。
`);

console.log(line);
console.log('同一批数据，只改q 的定义（缺陷2）看效果');
console.log(line);
console.log('  改动：难题的「断段」不再按比例扣分，改为「该有的环节齐不齐」');
console.log('  —— 一个难题 7 段断 1 段，其余环节都写出来了 → q = 1.0 而非 0.857\n');
for (const kind of ['强', '中']) {
  const runs = [];
  for (let t = 0; t < 40; t++) {
    const p = makeProfile(kind);
    // 新 q：只有「缺失关键环节」才扣，简单断段不扣
    runs.push(simulate(p, {
      segsOf: (o) => ({ 简单: 3, 中等: 5, 困难: 7 })[o.lv],
      // 用一个近似：断段数向下取整到「是否缺关键环节」
      // 难题断 1~2 段视为齐全（q=1），断 ≥3 才扣
    }));
  }
  const A = runs.reduce((s, r) => s + r.A, 0) / runs.length;
  console.log(`  ${KIND[kind].padEnd(20)} （q 未改）A=${p0(A)}`);
}
console.log('\n  → 上面是原样；要对比新 q 需要重写 q 逻辑，见下一版脚本');
