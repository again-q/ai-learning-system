#!/usr/bin/env node
// 建评测题面集：把 GAOKAO-Bench 原始题（output/golden/_src/*.json）转成统一 schema
// 用法：node scripts/build-eval-dataset.mjs
// 产出：output/golden/dataset-v1.json  （不推仓库：高考真题有版权，见 .gitignore）
// 说明：原始 schema = { keywords, example: [{ year, category, question, answer[], analysis, index, score }] }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'output/golden/_src');
const OUT = path.join(ROOT, 'output/golden/dataset-v1.json');
const LEGACY = path.join(ROOT, 'output/golden/golden-2025-I.json');

// 文件名关键词 → 我们的题型（与 judgeOne 的 选择|填空|解答|其他 对齐）
const TYPE_BY_FILE = [
  ['MCQs', '选择'],
  ['Fill-in-the-Blank', '填空'],
  ['Open-ended', '解答'],
];

function typeOf(fileName) {
  for (const [k, t] of TYPE_BY_FILE) if (fileName.includes(k)) return t;
  return '其他';
}

function main() {
  if (!fs.existsSync(SRC)) throw new Error(`缺少原始数据目录：${SRC}（先 curl 拉 GAOKAO-Bench 的 Data/ 下文件）`);
  const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.json') && f !== 'dataset-v1.json');
  const items = [];
  const byFile = [];

  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
    const list = Array.isArray(raw) ? raw : (raw.example || []);
    if (!list.length) { byFile.push([f, 0]); continue; }
    const type = typeOf(f);
    const slug = f.replace(/^\d{4}-\d{4}_/, '').replace(/\.json$/, '');
    list.forEach((q, i) => {
      items.push({
        id: `gk-${q.year}-${slug}-${q.index != null ? q.index : i}`,
        source: 'GAOKAO-Bench (OpenLMLab)',
        year: String(q.year || ''),
        category: q.category || '',
        type,
        q: String(q.question || '').trim(),
        // answer 在原数据里是数组（正文+小题分问），统一成可读文本
        answer: Array.isArray(q.answer) ? q.answer.join(' | ') : String(q.answer || ''),
        analysis: String(q.analysis || '').trim(),
        score: q.score != null ? q.score : null,
        // 痕迹层留空：由合成/真实痕迹填入（见 doc/architecture/评测数据集预研.md）
        trace: null,
        expect: null,
      });
    });
    byFile.push([f, list.length]);
  }

  // 并入已有的 2025 新高考 I 卷 8 题（原本只有 {id,type,q}，无答案）
  let legacyCount = 0;
  if (fs.existsSync(LEGACY)) {
    const legacy = JSON.parse(fs.readFileSync(LEGACY, 'utf8'));
    for (const q of legacy) {
      items.push({
        id: q.id, source: '2025 新高考 I 卷（手工录入）', year: '2025', category: '新高考I卷',
        type: q.type || '其他', q: String(q.q || '').trim(),
        answer: q.answer || '', analysis: q.analysis || '', score: null,
        trace: null, expect: null,
      });
      legacyCount++;
    }
  }

  const meta = {
    builtAt: new Date().toISOString(),
    purpose: '回归评测题面集（L1）：题面 + 答案 + 解析；痕迹（L2）与期望标注（L3）另行填',
    files: byFile,
    total: items.length,
    byType: items.reduce((a, x) => (a[x.type] = (a[x.type] || 0) + 1, a), {}),
    byYear: items.reduce((a, x) => (a[x.year] = (a[x.year] || 0) + 1, a), {}),
    legacyCount,
  };
  fs.writeFileSync(OUT, JSON.stringify({ meta, items }, null, 1));
  console.log(`✅ ${OUT}`);
  console.log(`   合计 ${meta.total} 题（选择题 ${meta.byType['选择'] || 0} / 填空 ${meta.byType['填空'] || 0} / 解答 ${meta.byType['解答'] || 0} / 其他 ${meta.byType['其他'] || 0}）`);
  console.log(`   年份 ${Object.keys(meta.byYear).sort().join(',')}`);
  for (const [f, n] of byFile) console.log(`   - ${f}: ${n}`);
}

main();
