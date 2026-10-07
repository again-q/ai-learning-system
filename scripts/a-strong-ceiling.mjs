/**
 * 「较强」学生的 100 道真实构成 · U₀ = 0.5 下的天花板
 * 跑法：node scripts/a-strong-ceiling.mjs
 *
 * 不用随机化 —— 按较强学生的实际做题形态逐题构造。
 * 较强 = 你的经验基准 0.8~0.9（难题做得出来，中档稳，简单题不丢）
 */

const D = { 简单: 0.2, 中等: 0.5, 困难: 0.85 };
const SEGS = { 简单: 3, 中等: 5, 困难: 7 };
const CAL = (lv) => 0.6 + 0.4 * D[lv];
const Q = (lv, brk) => 1 - brk / SEGS[lv];
const S = (lv, P, brk) => P * CAL(lv) * Q(lv, brk);

function run(U0, profile, alpha = 0.25, label = '') {
  let A = 0.30, U = U0, hi = 0, lo = 0;
  const uUp = [], uDown = [], marks = [];
  profile.forEach((o, i) => {
    const s = S(o.lv, o.P, o.brk);
    const before = U;
    if (s >= 0.8) hi++; else hi = 0;
    if (hi >= 2) { U += 0.05 * (1 - U); uUp.push(`第${i + 1}题 s=${s.toFixed(3)} → U ${before.toFixed(3)}→${U.toFixed(3)}`); hi = 0; }
    if (s <= 0.6) { lo++; if (lo >= 5) { U -= 0.03 * (U - A); uDown.push(`第${i + 1}题 s=${s.toFixed(3)} → U ${before.toFixed(3)}→${U.toFixed(3)}`); lo = 0; } } else lo = 0;
    A = Math.max(0, Math.min(U, A + alpha * (s - A) * (U - A)));
    if ((i + 1) % 10 === 0 || i === 0) marks.push({ n: i + 1, lv: o.lv, s, A, U });
  });
  return { label, A, U, uUp, uDown, marks, n: profile.length };
}

// ── 「较强」学生的 100 道：简单题偶有失误，中档稳，难题做得出来 ──
function buildStrong() {
  const p = [];
  // 简单 70 道：较强学生简单题基本全对，偶有一两道半对（很少）
  const easy = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
                1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
                1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
                1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.9, 0.8];
  easy.forEach(P => p.push({ lv: '简单', P, brk: P === 1 ? 0 : P > 0.85 ? 1 : 2 }));
  // 中等 20 道：较强学生中档基本做对，偶尔断 1 段
  for (let i = 0; i < 20; i++) p.push({ lv: '中等', P: i >= 17 ? 0.9 : 1.0, brk: i >= 17 ? 1 : 0 });
  // 困难 10 道：较强学生难题能拿分，但过程有断——P 高、断 1~2 段
  const hard = [0.9, 0.85, 0.9, 0.8, 0.9, 0.7, 0.85, 0.9, 0.6, 0.8];
  const hardBrk = [1, 1, 1, 2, 1, 2, 1, 1, 3, 2];
  hard.forEach((P, i) => p.push({ lv: '困难', P, brk: hardBrk[i] }));
  return p;
}

// 对照：较强里的偏下（难题只做出一半）
function buildStrongMid() {
  const p = buildStrong();
  const hard = [0.6, 0.5, 0.7, 0.4, 0.6, 0.3, 0.5, 0.6, 0.2, 0.4];
  const hardBrk = [2, 3, 2, 4, 2, 4, 3, 2, 5, 4];
  p.splice(90, 10, ...hard.map((P, i) => ({ lv: '困难', P, brk: hardBrk[i] })));
  return p;
}

const P0 = (x) => (x * 100).toFixed(1);
const line = '='.repeat(78);

console.log(line);
console.log('「较强」学生的 100 道构成（简单 70 / 中等 20 / 困难 10）· U₀ = 0.50');
console.log(line);

const strong = buildStrong();
const uniq = {};
for (const o of strong) {
  const k = `${o.lv} P=${o.P} 断=${o.brk}`;
  (uniq[k] = uniq[k] || []).push(S(o.lv, o.P, o.brk));
}
console.log('\n  这一批里 s 一共只有这几个取值：');
console.log('  ' + '─'.repeat(60));
console.log('  题层      难度校准   P      断   q      s        该取值出现次数');
for (const k of Object.keys(uniq)) {
  const o = strong.find(x => `${x.lv} P=${x.P} 断=${x.brk}` === k);
  const s = S(o.lv, o.P, o.brk);
  const over = s >= 0.8 ? '  ← 够上浮门槛' : '';
  console.log(`  ${o.lv.padEnd(6)}  ${CAL(o.lv).toFixed(3)}     ${String(o.P).padEnd(5)} ${String(o.brk).padStart(2)}   ${Q(o.lv, o.brk).toFixed(3)}  ${s.toFixed(3)}   ${String(uniq[k].length).padStart(3)} 次${over}`);
}
console.log(`\n  → s 最大值出现在中档 P=1.0 断=0：s = 0.800（刚好等于门槛）`);
console.log(`  → 困难题即使 P=0.9 断=1：s = ${S('困难', 0.9, 1).toFixed(3)}（低于门槛）`);

for (const [name, prof] of [['较强（难题做得出来）', strong], ['较强·偏下（难题只做一半）', buildStrongMid()]]) {
  const r = run(0.50, prof, 0.25, name);
  console.log('\n' + line);
  console.log(`${name}   U₀=0.50  α=0.25  上浮门槛 s≥0.8 两连`);
  console.log(line);
  console.log('  题数   题层    s       A        U');
  for (const m of r.marks) {
    console.log(`  ${String(m.n).padStart(4)}   ${m.lv.padEnd(5)}  ${m.s.toFixed(3)}  ${P0(m.A).padStart(5)}   ${P0(m.U).padStart(5)}`);
  }
  console.log(`\n  期末 A = ${P0(r.A)}   期末 U = ${P0(r.U)}`);
  console.log(`  U 上浮 ${r.uUp.length} 次${r.uUp.length ? '：' : ''}`);
  r.uUp.forEach(x => console.log(`    ${x}`));
  if (r.uDown.length) { console.log(`  U 下浮 ${r.uDown.length} 次：`); r.uDown.forEach(x => console.log(`    ${x}`)); }
  const target = name.includes('偏下') ? 0.7 : 0.85;
  console.log(`  你的基准 ${target}  →  差 ${((target - r.A) * 100).toFixed(1)} 个点 ${r.A >= target - 0.05 ? '✅ 命中' : '🟡 偏低'}`);
}

console.log('\n' + line);
console.log('U₀=0.65 对照（同样这两批数据）');
console.log(line);
for (const [name, prof] of [['较强', strong], ['较强·偏下', buildStrongMid()]]) {
  const r = run(0.65, prof);
  console.log(`  ${name.padEnd(10)}  A=${P0(r.A)}  U=${P0(r.U)}  上浮 ${r.uUp.length} 次`);
}
