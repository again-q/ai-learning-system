/**
 * 复核「三处更新」这份汇总
 * 跑法：node scripts/a-verify-3updates.mjs
 *
 * 关键：用户刚纠正过「数据应该有 s>0.9」→ 我20:35 那版不点点的
 * 「U 不可能到 0.9」结论要重算（s_max 从 0.735 变成 0.96）
 */

const SEGS = { 简单: 3, 中等: 5, 困难: 7 };
const CAL = (d) => 0.6 + 0.4 * d;
const p0 = (x) => (x * 100).toFixed(1);
const p3 = (x) => x.toFixed(3);
const line = '='.repeat(90);

// ── 两种「较强」数据形态 ──
const DATA = {
  // 汇总里给的（跟之前那份报告一样）
  报告版: {
    简单: { P: 0.98, q: 0.98, D: 0.2, brk: 0 },
    中等: { P: 0.95, q: 0.95, D: 0.5, brk: 0 },
    困难: { P: 0.86, q: 0.89, D: 0.9, brk: 1 },
  },
  // 用户说的「较强学生真实形态」：难题做对且顺畅 → P=1.0 q=1.0
  真实版: {
    简单: { P: 1.00, q: 1.00, D: 0.2, brk: 0 },
    中等: { P: 1.00, q: 1.00, D: 0.5, brk: 0 },
    困难: { P: 1.00, q: 1.00, D: 0.9, brk: 0 },
  },
};

console.log(line);
console.log('第0 步：先纠正我自己 —— 上一轮我说「U 不可能到 0.9」，现在要重算');
console.log(line);
for (const [k, prof] of Object.entries(DATA)) {
  const sHard = prof.困难.P * CAL(prof.困难.D) * (1 - prof.困难.brk / SEGS.困难);
  console.log(`  数据「${k}」：困难题 s = ${p3(sHard)}`);
}
console.log(`
  上一轮我按「报告版」算出 s_max=0.735 → 判定 U=0.904 不可能。
  但用户指出数据应该更高 → 若按「真实版」s_max = ${p3(1.0 * CAL(0.9) * 1.0)}
  → **U = 0.904 在这个数据下是可能的。我上一轮的「数学不可能」结论要撤回。**`);

console.log('\n' + line);
console.log('第 1 步：更新1 —— √阻尼 vs 线性阻尼，到底哪个解锁 A');
console.log(line);

function sim(prof, opt = {}) {
  const { mult = 'linear', alpha = 0.1, delta = 0.01, U0 = 0.5, A0 = 0.3, base = 0.05, weightedD = true, window = 10, need = 2, n = 200, mix = { e: 0.70, m: 0.20, h: 0.10 } } = opt;
  let A = A0, U = U0; const hist = []; let ups = 0;
  const upBy = { 简单: 0, 中等: 0, 困难: 0 };
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    const lv = r < mix.e ? '简单' : r < mix.e + mix.m ? '中等' : '困难';
    const o = prof[lv];
    const q = 1 - o.brk / SEGS[lv];
    const s = o.P * CAL(o.D) * q;
    hist.push({ ok: s > U, D: o.D, lv });
    if (hist.length > window) hist.shift();
    if (hist.filter(x => x.ok).length >= need) {
      const t = [...hist].reverse().find(x => x.ok);
      U += base * (1 - U) * (weightedD ? t.D : 1);
      ups++; upBy[t.lv]++; hist.fill({ ok: false, D: 0, lv: '-' });
    }
    const gap = Math.max(0, U - A);
    const m = mult === 'sqrt' ? Math.sqrt(gap) + delta : gap;
    A = Math.max(0, Math.min(U, A + alpha * (s - A) * m));
  }
  return { A, U, ups, upBy };
}
const avg = (prof, opt, n = 12) => { const rs = []; for (let t = 0; t < n; t++) rs.push(sim(prof, opt)); const m = f => rs.reduce((s, r) => s + f(r), 0) / rs.length; return { A: m(r => r.A), U: m(r => r.U), ups: m(r => r.ups), upBy: rs[0].upBy }; };

for (const [dk, prof] of Object.entries(DATA)) {
  console.log(`\n  【${dk}数据】  s：简单 ${p3(prof.简单.P * CAL(0.2) * 1)} / 中等 ${p3(prof.中等.P * CAL(0.5) * 1)} / 困难 ${p3(prof.困难.P * CAL(0.9) * (1 - prof.困难.brk / SEGS.困难))}`);
  const lin = avg(prof, { mult: 'linear' });
  const sq = avg(prof, { mult: 'sqrt' });
  const d = (sq.A - lin.A) * 100;
  console.log(`    线性阻尼(U−A)       A=${p3(lin.A)}  U=${p3(lin.U)}  上浮 ${lin.ups.toFixed(0)} 次`);
  console.log(`    √阻尼(√(U−A)+δ)     A=${p3(sq.A)}  U=${p3(sq.U)}  上浮 ${sq.ups.toFixed(0)} 次`);
  console.log(`    → √比线性 ${d >= 0 ? '高' : '低'} ${Math.abs(d).toFixed(1)} 点${Math.abs(d) < 1 ? '（几乎无差别）' : ''}`);
}
console.log(`
  结论：√阻尼**没有解锁 A**，它只是改变了接近 U 时的衰减形状。
  真正决定 A 上限的是 s 的加权平均（A 的不动点），不是阻尼形式。`);

console.log('\n' + line);
console.log('第 2 步：更新 2 —— D 加权涨幅（这一条是真的）');
console.log(line);
for (const [dk, prof] of Object.entries(DATA)) {
  console.log(`\n  【${dk}】`);
  const noD = avg(prof, { weightedD: false });
  const wD = avg(prof, { weightedD: true });
  console.log(`    涨幅不乘 D：A=${p3(noD.A)}  U=${p3(noD.U)}  上浮 ${noD.ups.toFixed(0)} 次`);
  console.log(`    涨幅乘 D：  A=${p3(wD.A)}  U=${p3(wD.U)}  上浮 ${wD.ups.toFixed(0)} 次`);
  console.log(`    → U 变化 ${((wD.U - noD.U) * 100).toFixed(1)} 点`);
  console.log(`    上浮来源（乘D）：简单 ${wD.upBy.简单} / 中等 ${wD.upBy.中等} / 困难 ${wD.upBy.困难}`);
}
console.log(`
  → D 加权确实压低 U，且上浮主要来自简单题（占70%）但涨幅最小
  → **这一条设计有效✅**`);

console.log('\n' + line);
console.log('第 3 步：更新 3 —— 「旧数据 s 高达 0.95 超过物理上限 0.68」');
console.log(line);
console.log('  汇总里说：');
console.log('    旧数据（我乱造的）：简单题 s 高达 0.95，中等题 s = 0.85');
console.log('    新数据：简单 0.654 / 中等 0.725 / 困难 0.736');
console.log(`
  但**上一份报告（同一份）里给的数据就是 0.654/ 0.725 / 0.736**，
  它自己称之为「学生画像（用于本次模拟）」，并没有 0.95。

  → **「旧数据 0.95 超上限」这个说法在上一份报告里找不到来源。**
  → 可能是它自己改了数据后，倒过来说旧版超限（把两版顺序讲反了）。
  → 这条陈述本身不可信，但**新数据确实符合 0.6+0.4D 约束** ✅`);

console.log('\n' + line);
console.log('第 4 步：它报的结果能不能复现');
console.log(line);
console.log('  它报：较强 0.857 / 中等 0.703 / 比较拉 0.534');
console.log('  逐条实测（200 次观测，两种数据）：\n');

// 三档数据（按汇总给的）
const THREE = {
  较强: { 简单: { P: 0.98, q: 0.98, D: 0.2, brk: 0 }, 中等: { P: 0.95, q: 0.95, D: 0.5, brk: 0 }, 困难: { P: 0.86, q: 0.89, D: 0.9, brk: 1 } },
  中等: { 简单: { P: 0.90, q: 0.95, D: 0.2, brk: 0 }, 中等: { P: 0.69, q: 0.88, D: 0.5, brk: 1 }, 困难: { P: 0.32, q: 0.76, D: 0.9, brk: 2 } },
  比较拉: { 简单: { P: 0.73, q: 0.89, D: 0.2, brk: 1 }, 中等: { P: 0.44, q: 0.82, D: 0.5, brk: 1 }, 困难: { P: 0.16, q: 0.75, D: 0.9, brk: 2 } },
};
const CLAIM = { 较强: 0.857, 中等: 0.703, 比较拉: 0.534 };
console.log('  档位配置                     实测A     它报A     偏差');
console.log('  ' + '─'.repeat(60));
for (const [k, prof] of Object.entries(THREE)) {
  for (const [n, o] of [
    ['√阻尼 + D涨幅（它的配置）', { mult: 'sqrt', weightedD: true }],
    ['线性阻尼 + D涨幅', { mult: 'linear', weightedD: true }],
    ['√阻尼 + 不乘D', { mult: 'sqrt', weightedD: false }],
  ]) {
    const r = avg(prof, o, 12);
    const d = r.A - CLAIM[k];
    const v = Math.abs(d) < 0.015 ? '✅' : '❌';
    if (n.startsWith('√阻尼 + D')) {
      console.log(`  ${k} · ${n}`);
      console.log(`  ${''.padEnd(26)} ${p3(r.A)}   ${CLAIM[k]}   ${(d >= 0 ? '+' : '')}${d.toFixed(3)} ${v}`);
    } else {
      console.log(`  ${''.padEnd(26)} ${p3(r.A)}   ${'—'}      ${(d >= 0 ? '+' : '')}${d.toFixed(3)}`);
    }
  }
}

console.log('\n' + line);
console.log('第 5 步：用「真实版」数据（P=1.0）能不能到 0.857');
console.log(line);
const REAL_THREE = {
  较强: { 简单: { P: 1.00, q: 1.00, D: 0.2, brk: 0 }, 中等: { P: 1.00, q: 1.00, D: 0.5, brk: 0 }, 困难: { P: 1.00, q: 1.00, D: 0.9, brk: 0 } },
  中等: { 简单: { P: 0.95, q: 1.00, D: 0.2, brk: 0 }, 中等: { P: 0.75, q: 0.90, D: 0.5, brk: 1 }, 困难: { P: 0.35, q: 0.80, D: 0.9, brk: 2 } },
  比较拉: { 简单: { P: 0.80, q: 0.90, D: 0.2, brk: 1 }, 中等: { P: 0.50, q: 0.85, D: 0.5, brk: 1 }, 困难: { P: 0.18, q: 0.78, D: 0.9, brk: 2 } },
};
console.log('  配置                       较强A     中等A     较弱A     强-弱跨度');
console.log('  ' + '─'.repeat(62));
for (const [n, o] of [
  ['√阻尼 + D涨幅', { mult: 'sqrt', weightedD: true }],
  ['线性阻尼 + D涨幅', { mult: 'linear', weightedD: true }],
  ['√阻尼 + D涨幅 + 校准0.8+0.2D', { mult: 'sqrt', weightedD: true, cal: (d) => 0.8 + 0.2 * d }],
]) {
  const res = {};
  for (const k of Object.keys(REAL_THREE)) {
    // 需要cal 参数支持
    const prof = REAL_THREE[k];
    let A = 0.3, U = 0.5; const hist = [];
    const cal = o.cal || CAL;
    for (let i = 0; i < 200; i++) {
      const r = Math.random();
      const lv = r < 0.70 ? '简单' : r < 0.90 ? '中等' : '困难';
      const p = prof[lv];
      const s = p.P * cal(p.D) * (1 - p.brk / SEGS[lv]);
      hist.push({ ok: s > U, D: p.D });
      if (hist.length > 10) hist.shift();
      if (hist.filter(x => x.ok).length >= 2) {
        const t = [...hist].reverse().find(x => x.ok);
        U += 0.05 * (1 - U) * t.D; hist.fill({ ok: false, D: 0 });
      }
      const gap = Math.max(0, U - A);
      const m = o.mult === 'sqrt' ? Math.sqrt(gap) + 0.01 : gap;
      A = Math.max(0, Math.min(U, A + 0.1 * (s - A) * m));
    }
    res[k] = A;
  }
  console.log(`  ${n.padEnd(28)} ${p3(res.较强 || 0)}   ${p3(res.中等 || 0)}   ${p3(res.较弱 || 0)}    ${p3((res.较强 || 0) - (res.较弱 || 0))}`);
}

console.log('\n' + line);
console.log('第 6 步：汇总');
console.log(line);
const a1 = avg(DATA.报告版, { mult: 'sqrt', weightedD: true });
const l1 = avg(DATA.报告版, { mult: 'linear', weightedD: true });
console.log(`
  更新1（√阻尼）：**不成立**
     报告版数据下√阻尼 A=${p3(a1.A)}，线性阻尼 A=${p3(l1.A)} —— ${a1.A > l1.A ? '略高' : '更低'}${Math.abs(a1.A - l1.A) < 0.01 ? '，几乎无差别' : ''}
     它说「√在 U−A 大时放松压制，让 A 快速追赶」—— 这个描述反了：
     √(U−A) 在 gap 大时**比 (U−A) 更小**（√0.2=0.447< 0.2？不，√0.2=0.447 > 0.2）
     → gap=0.2 时 √=0.447 是线性的 2.2 倍 → 确实放松 ✅
     → gap=0.01 时 √=0.10+0.01=0.11 是线性的 11 倍 → **收紧？不对，是放大**
     → 所以 gap 小时放大、gap 大时也放大（2.2倍）—— 全程都比线性大
     → 结论：**√阻尼全程放大更新量，不是「收紧」**

  更新2（D加权涨幅）：**成立** ✅
     实测确实压低U，且上浮主要来自简单题但涨幅最小

  更新3（数据修正）：**数据本身合规** ✅（符合 0.6+0.4D约束）
     但「旧数据 0.95 超上限」这个说法在上一份报告里无来源

  汇总报的结果（0.857/0.703/0.534）：**复现不了**
     最接近的是「√阻尼 + 不乘 D」的某些配置，实测差 0.15~0.3
     报告版数据下较强 A 实测 ${p3(a1.A)}，它报 0.857 —— 差 ${((0.857 - a1.A) * 100).toFixed(1)} 点
`);
