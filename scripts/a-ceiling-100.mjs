/**
 * 100 道题的构成明细 + 随机化对照
 * 跑法：node scripts/a-ceiling-100.mjs
 */

function run(U0, profile, alpha = 0.25) {
  let A = 0.30, U = U0, hi = 0, lo = 0, uMoves = 0;
  const trace = [];
  for (const { lv, P, brk } of profile) {
    const D = { 简单: 0.2, 中等: 0.5, 困难: 0.85 }[lv];
    const segs = { 简单: 3, 中等: 5, 困难: 7 }[lv];
    const q = segs > 0 ? 1 - brk / segs : 1;
    const s = P * (0.6 + 0.4 * D) * q;
    if (s >= 0.8) hi++; else hi = 0;
    if (hi >= 2) { U += 0.05 * (1 - U); uMoves++; hi = 0; }
    if (s <= 0.6) { lo++; if (lo >= 5) { U -= 0.03 * (U - A); lo = 0; } } else lo = 0;
    A = Math.max(0, Math.min(U, A + alpha * (s - A) * (U - A)));
    trace.push(s);
  }
  return { A, U, uMoves, trace };
}

// ── 原来那批：70 道简单题参数完全相同 ──
function buildFixed(kind) {
  const p = [];
  for (let i = 0; i < 70; i++) p.push({ lv: '简单', P: 1.0, brk: 0 });
  for (let i = 0; i < 20; i++)
    p.push({ lv: '中等', P: kind === '强' ? 1.0 : kind === '中等' ? 0.7 : 0.4,
             brk: kind === '强' ? 0 : kind === '中等' ? 2 : 4 });
  for (let i = 0; i < 10; i++)
    p.push({ lv: '困难', P: kind === '强' ? 0.9 : kind === '中等' ? 0.5 : 0.0,
             brk: kind === '强' ? 1 : kind === '中等' ? 3 : 6 });
  return p;
}

// ── 随机化：简单题也有好有坏，中档难题浮动 ──
function buildRandom(kind, seed) {
  let r = seed;
  const rnd = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const p = [];
  for (let i = 0; i < 70; i++) {
    // 强的学生简单题也有失误；弱的学生简单题不是全对
    const base = kind === '强' ? 0.97 : kind === '中等' ? 0.92 : 0.80;
    const P = clamp(base + (rnd() - 0.5) * 0.3, 0, 1);
    const brk = P > 0.95 ? 0 : P > 0.8 ? 1 : 2;
    p.push({ lv: '简单', P: +P.toFixed(2), brk });
  }
  for (let i = 0; i < 20; i++) {
    const base = kind === '强' ? 0.95 : kind === '中等' ? 0.65 : 0.35;
    const P = clamp(base + (rnd() - 0.5) * 0.4, 0, 1);
    const brk = Math.round((1 - P) * 4);
    p.push({ lv: '中等', P: +P.toFixed(2), brk });
  }
  for (let i = 0; i < 10; i++) {
    const base = kind === '强' ? 0.80 : kind === '中等' ? 0.35 : 0.05;
    const P = clamp(base + (rnd() - 0.5) * 0.4, 0, 1);
    const brk = Math.round((1 - P) * 6);
    p.push({ lv: '困难', P: +P.toFixed(2), brk });
  }
  return p;
}

const P0 = (x) => (x * 100).toFixed(1).padStart(5);
const line = '='.repeat(74);

console.log(line);
console.log('一、原来那 100 道的构成（简单 70 / 中等 20 / 困难 10）');
console.log(line);
const KIND_LABEL = { 强: '较强', 中等: '中等', 弱: '比较拉' };
for (const kind of ['强', '中等', '弱']) {
  const p = buildFixed(kind);
  const byLv = {};
  for (const x of p) {
    byLv[x.lv] = byLv[x.lv] || { n: 0, Ps: new Set(), brks: new Set() };
    byLv[x.lv].n++;
    byLv[x.lv].Ps.add(x.P);
    byLv[x.lv].brks.add(x.brk);
  }
  console.log(`\n  【${KIND_LABEL[kind]}】`);
  for (const lv of ['简单', '中等', '困难']) {
    const b = byLv[lv];
    const D = { 简单: 0.2, 中等: 0.5, 困难: 0.85 }[lv];
    const segs = { 简单: 3, 中等: 5, 困难: 7 }[lv];
    const sSet = [...b.Ps].map(P => {
      const brks = [...b.brks];
      return brks.map(brk => {
        const q = 1 - brk / segs;
        return +(P * (0.6 + 0.4 * D) * q).toFixed(3);
      });
    }).flat();
    const uniqS = [...new Set(sSet)].sort((a, b) => a - b);
    console.log(`    ${lv}  ${String(b.n).padStart(3)} 道   D=${D}  段数=${segs}   P∈{${[...b.Ps].join(',')}}  断∈{${[...b.brks].join(',')}}`);
    console.log(`          → s 只有 ${uniqS.length} 个不同取值：${uniqS.join(', ')}`);
  }
}

console.log('\n' + line);
console.log('二、这批数据的两个问题');
console.log(line);
console.log(`
  ① 70 道简单题的参数完全一样（P=1.0, 断=0）→ 70 次观测是同一个值重复 70 次
     真实的 70 道简单题不可能全对 —— 这批数据偏乐观

  ② 简单题 s = 1.0 × 0.68 × 1.0 = 0.68，全部低于 U 上浮门槛 0.8
     → U 只能靠中档/困难题触发上浮，而那只有 30 次观测
`);

console.log('\n' + line);
console.log('三、随机化重跑（简单题也有好有坏，U₀ = 0.50）');
console.log(line);
console.log('  场景              原批(固定)              随机化 20 次平均 [min ~ max]');
console.log('  ' + '─'.repeat(68));
for (const kind of ['强', '中等', '弱']) {
  const fixed = run(0.50, buildFixed(kind));
  const rs = [];
  for (let seed = 1; seed <= 20; seed++) rs.push(run(0.50, buildRandom(kind, seed * 7919)));
  const avg = rs.reduce((s, r) => s + r.A, 0) / rs.length;
  const mn = Math.min(...rs.map(r => r.A));
  const mx = Math.max(...rs.map(r => r.A));
  console.log(`  ${KIND_LABEL[kind].padEnd(8)}      A=${P0(fixed.A)}  U=${P0(fixed.U)}  上浮${String(fixed.uMoves).padStart(2)}次      A=${P0(avg)}  [${P0(mn)} ~ ${P0(mx)}]`);
}
const rs = [];
for (let seed = 1; seed <= 20; seed++) rs.push(run(0.50, buildRandom('弱', seed * 7919)));
const avg = rs.reduce((s, r) => s + r.A, 0) / rs.length;
const mn = Math.min(...rs.map(r => r.A));
const mx = Math.max(...rs.map(r => r.A));
console.log(`\n  U₀=0.65 对照（随机化 · 比较拉）：A=${P0(avg)}  [${P0(mn)} ~ ${P0(mx)}]`);
for (const seed of [7919, 15838]) {
  const r = run(0.65, buildRandom('弱', seed));
  console.log(`    seed=${seed}  U₀=0.65 → A=${P0(r.A)}  U=${P0(r.U)}`);
}
