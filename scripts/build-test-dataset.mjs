#!/usr/bin/env node
// 建「统一测试数据集」：把我们**至今测过的一切**并成一个文件
// 用法：node scripts/build-test-dataset.mjs
// 产出：output/golden/dataset-v2.json
// 内容：题面(L1) + 人工断言(expect) + 跑过的结果(runs，指向原始证据) + 合成痕迹(L2)
// 来源：
//   ① output/golden/dataset-v1.json        高考真题 418 + 2025-I 卷 8（scripts/build-eval-dataset.mjs 产出）
//   ② scripts/smoke-decompose-points.mjs   T1–T8 冒烟题面 + expect（含跑过的 raw 轮次）
//   ③ scripts/smoke-two-stage.mjs          T2/T7 两段式冒烟
//   ④ output/smoke-拆考点/report.json       拆考点冒烟的 C1/C2/C6 检查结论
//   ⑤ output/smoke-twostage/*.json          两段式冒烟结果
//   ⑥ output/golden/results/result.json     2025-I 卷 8 题的评测结果
//   ⑦ output/golden/traces/traces-v1.json   合成痕迹（4 角色）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'output/golden/dataset-v2.json');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const exists = (p) => fs.existsSync(path.join(ROOT, p));

// ---------- 从冒烟脚本源码里抽 SET 区块（脚本 import 会触发模型调用，不能 import） ----------
function setBlock(relPath) {
  const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const i = src.indexOf('const SET = {');
  const j = src.indexOf('};', i);
  if (i < 0 || j < 0) throw new Error(`${relPath} 里找不到 SET 区块`);
  return src.slice(i, j + 2);
}

function parseDecomposeFixtures() {
  const block = setBlock('scripts/smoke-decompose-points.mjs');
  const re = /(T\d+):\s*\{\s*q:\s*(?:'([^']*)'|`([^`]*)`)\s*,\s*expect:\s*'([^']*)'\s*\}/g;
  const out = [];
  let m;
  while ((m = re.exec(block))) out.push({ id: `smoke-decompose-${m[1]}`, q: m[2] || m[3], expect: m[4] });
  if (out.length !== 8) throw new Error(`拆考点 fixtures 应 8 条，实抽到 ${out.length} 条（源码格式可能变了）`);
  return out;
}

function parseTwoStageFixtures() {
  const block = setBlock('scripts/smoke-two-stage.mjs');
  const re = /(T\d+):\s*(?:'([^']*)'|`([^`]*)`)\s*,/g;
  const out = [];
  let m;
  while ((m = re.exec(block))) out.push({ id: `smoke-twostage-${m[1]}`, q: m[2] || m[3] });
  if (out.length !== 2) throw new Error(`两段式 fixtures 应 2 条，实抽到 ${out.length} 条`);
  return out;
}

function main() {
  // ---------- ① 题面底座 ----------
  if (!exists('output/golden/dataset-v1.json')) throw new Error('缺 dataset-v1.json（先跑 scripts/build-eval-dataset.mjs）');
  const v1 = rd('output/golden/dataset-v1.json');
  const items = v1.items.map((x) => ({
    id: x.id,
    origin: x.source.includes('2025') ? 'golden-2025-I' : 'gaokao-bench',
    type: x.type, year: x.year, category: x.category || '',
    q: x.q, answer: x.answer || '', analysis: x.analysis || '',
    expect: null,   // L3 期望（考点清单/P_kp）尚未标注
    runs: [], traces: [],
  }));
  const byId = new Map(items.map((x) => [x.id, x]));

  // ---------- ②③ 冒烟 fixtures ----------
  const decFx = parseDecomposeFixtures();
  const twoFx = parseTwoStageFixtures();
  const addSmoke = (f, origin, expectNote) => {
    if (byId.has(f.id)) return;
    const it = {
      id: f.id, origin, type: '解答', year: '', category: '',
      q: f.q, answer: '', analysis: '',
      expect: { note: expectNote || f.expect || '' }, runs: [], traces: [],
    };
    items.push(it); byId.set(it.id, it);
  };
  // T8 与 T3 题面相同（expect 明写"题侧独立性(=T3)"）——保留两条，供一致性对比
  for (const f of decFx) addSmoke(f, 'smoke-decompose', f.expect);
  for (const f of twoFx) addSmoke(f, 'smoke-twostage', '两段式（漏章→可疑深挖）冒烟');

  // ---------- ④⑤⑥ 跑过的结果 ----------
  const decIds = new Set(decFx.map((f) => f.q));
  const twoQ = new Map(twoFx.map((f) => [f.id.replace('smoke-twostage-', ''), f.q]));

  // 拆考点 raw：T*_r*.json → { step1, step2, step3 }
  const RAW = 'output/smoke-拆考点/raw';
  if (exists(RAW)) {
    for (const f of fs.readdirSync(path.join(ROOT, RAW)).filter((x) => /^T\d+_r\d+\.json$/.test(x)).sort()) {
      const [, tid, round] = f.match(/^(T\d+)_r(\d+)\.json$/);
      const it = byId.get(`smoke-decompose-${tid}`);
      if (!it) continue;
      const d = rd(`${RAW}/${f}`);
      // 注意：raw 里模型输出是双层嵌套 —— step3[i].step3 = { pointIds, dkps, other }（踩过：读外层静默得 0）
      const steps = (d.step3 || []).map((s) => s.step3 || {});
      const got = steps.flatMap((s) => s.pointIds || []);
      const others = steps.flatMap((s) => s.other || []);
      if (got.length + others.length === 0) throw new Error(`${RAW}/${f} 抽到 0 个考点（结构又变了？）`);
      it.runs.push({
        script: 'scripts/smoke-decompose-points.mjs', round: Number(round), ref: `${RAW}/${f}`,
        summary: {
          chapters: (d.step1 || {}).chapters || [],
          gotCount: got.length, otherCount: others.length,
          // issues 由 resolvePicks 计算，raw 不含；结论看 report.json 的 checks
        },
      });
    }
  }

  // 拆考点 report.json（检查结论，只有被测到的题才有）
  if (exists('output/smoke-拆考点/report.json')) {
    const rep = rd('output/smoke-拆考点/report.json');
    for (const row of rep.rows || []) {
      const it = byId.get(`smoke-decompose-${row.id}`);
      if (!it) continue;
      it.expect = { ...(it.expect || {}), checks: { C1: row.C1, C2: row.C2, C6: row.C6 }, reportAt: rep.meta && rep.meta.ts };
    }
  }

  // 两段式结果
  for (const tid of twoQ.keys()) {
    const p = `output/smoke-twostage/${tid}.json`;
    if (!exists(p)) continue;
    const it = byId.get(`smoke-twostage-${tid}`);
    const d = rd(p);
    it.runs.push({
      script: 'scripts/smoke-two-stage.mjs', round: 1, ref: p,
      summary: { flag: d.flag, r1Chapters: (d.r1 && d.r1.chapters) || [], r2Chapters: (d.r2 && d.r2.chapters) || [], seconds: d.seconds },
    });
  }

  // 2025-I 卷评测结果
  if (exists('output/golden/results/result.json')) {
    const res = rd('output/golden/results/result.json');
    for (const row of res.rows || []) {
      const it = byId.get(row.id);
      if (!it) continue;
      it.runs.push({
        script: 'scripts/eval-golden.mjs', round: 1, ref: 'output/golden/results/result.json',
        summary: {
          model: res.model, cfg: res.cfg, seconds: row.seconds,
          chapters: row.chapters || [], gotCount: (row.got || []).length,
          got: (row.got || []).map((g) => `${g.name}(${g.dkp})`),
          otherCount: (row.others || []).length, scopeOut: row.scopeOut || null,
        },
      });
    }
  }

  // ---------- ⑦ 合成痕迹 ----------
  if (exists('output/golden/traces/traces-v1.json')) {
    const tr = rd('output/golden/traces/traces-v1.json');
    for (const t of tr.traces || []) {
      const it = byId.get(t.id);
      if (!it) continue;
      it.traces.push({
        role: t.role, synthetic: true, source: 'scripts/synth-traces.mjs',
        traceText: t.traceText, studentAnswer: t.studentAnswer,
        segments: t.segments, breakpoint: t.breakpoint, processAvailable: t.processAvailable,
        verify: t.verify || null, quality: t.quality || null,
      });
    }
  }

  // ---------- 元信息 ----------
  const counts = {
    items: items.length,
    withExpect: items.filter((x) => x.expect).length,
    withRuns: items.filter((x) => x.runs.length).length,
    withTraces: items.filter((x) => x.traces.length).length,
    traces: items.reduce((a, x) => a + x.traces.length, 0),
    runs: items.reduce((a, x) => a + x.runs.length, 0),
    byOrigin: items.reduce((a, x) => (a[x.origin] = (a[x.origin] || 0) + 1, a), {}),
    byType: items.reduce((a, x) => (a[x.type] = (a[x.type] || 0) + 1, a), {}),
  };
  const meta = {
    version: 'test-dataset-v2', builtAt: new Date().toISOString(),
    purpose: '统一测试数据集：(L1)题面 + (expect)人工断言 + (runs)已跑结果索引 + (L2)合成痕迹。回归测试直接吃这个文件，不必再拍照/重造。',
    sources: [
      { id: 'gaokao-bench', path: 'output/golden/dataset-v1.json ← output/golden/_src/*.json', role: 'L1 题面（高考真题 2010-2022 I 卷）' },
      { id: 'golden-2025-I', path: 'output/golden/golden-2025-I.json', role: 'L1 题面（2025 新高考 I 卷 8 题）' },
      { id: 'smoke-decompose', path: 'scripts/smoke-decompose-points.mjs + output/smoke-拆考点/', role: '题面+expect+已跑结果（T1–T8）' },
      { id: 'smoke-twostage', path: 'scripts/smoke-two-stage.mjs + output/smoke-twostage/', role: '题面+已跑结果（T2/T7）' },
      { id: 'golden-eval', path: 'output/golden/results/result.json', role: '评测结果（2025-I 卷 8 题）' },
      { id: 'synth-traces', path: 'output/golden/traces/traces-v1.json', role: 'L2 合成痕迹（4 角色）' },
    ],
    notIncluded: [
      { path: 'output/agent1_layout | agent2_extraction | agent3_quality | raw | sections', why: '图像/转录管线中间产物（绑照片，无题面/痕迹语义），未纳入' },
      { path: 'output/archive', why: '历史归档，未纳入' },
    ],
    counts,
    caveats: [
      'expect（L3）尚未系统标注：目前只有冒烟 T1–T8 的一句人工断言，高考真题 418 题的考点期望待 D2 产出 + 抽检',
      'runs 里 report.json 只有 T7 一行（那次跑了 --only=T7），不是全量检查结论',
      'traces 均为合成（synthetic），带 quality 的条目为可疑数据，消费时请忽略',
    ],
  };

  fs.writeFileSync(OUT, JSON.stringify({ meta, items }, null, 1));
  console.log(`✅ ${OUT}`);
  console.log(`   条目 ${counts.items}（有 expect ${counts.withExpect} / 有 runs ${counts.withRuns} / 有痕迹 ${counts.withTraces}）`);
  console.log(`   runs ${counts.runs} 条，痕迹 ${counts.traces} 条`);
  console.log(`   来源分布 ${JSON.stringify(counts.byOrigin)}`);
  console.log(`   题型分布 ${JSON.stringify(counts.byType)}`);
}

main();
