#!/usr/bin/env node
// ============ Jev vs 字符匹配 · 合规性对照（只读，用已落盘明细） ============
//
// 为什么需要这一层：
//   裸比「命中率」会得出错误结论 —— 字符匹配 92.7% > Jev 78.2%（去重 55 题）。
//   但决策 052/028 明确规定：
//     · 父节点**不得直接记账**（K 只能由子节点聚合）
//     · 方法类节点（partition='method'）**不做 K**（它只进 A）
//   所以「匹配到一个名字」≠「记了一笔合法的账」。
//   本脚本按【可记账性】重新给两边打分。
//
// 用法：node scripts/verify-match-compliance.mjs
import { find } from './db.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const L = '='.repeat(96);
const show = (t) => console.log('\n' + L + '\n  ' + t + '\n' + L);

// 最新一份 fair 明细
const dir = path.join(ROOT, 'output/jev');
const file = fs.readdirSync(dir).filter((x) => x.startsWith('fair-')).sort().pop();
if (!file) { console.error('找不到 fair-*.json，请先跑 verify-jev-fair.mjs'); process.exit(1); }
const d = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));

const nodes = find('knowledge_nodes', 1000, { knowledgeId: 1, name: 1, type: 1, parentId: 1, partition: 1, path: 1 });
const byName = {};
nodes.forEach((n) => { if (n.name) byName[String(n.name).trim()] = n; });
const parents = new Set(nodes.map((n) => n.parentId).filter(Boolean));
const parentsById = new Set();
nodes.forEach((n) => { if (n.parentId) parentsById.add(String(n.parentId)); });

/** 判断一个名字能否【合法】记 K。返回 null=合规，否则返回原因 */
function illegality(nm) {
  const n = byName[String(nm || '').trim()];
  if (!n) return '图谱中不存在';
  const id = String(n.knowledgeId || n._id);
  const reasons = [];
  if (parentsById.has(id)) reasons.push('父节点直记(052禁止)');
  if (String(n.partition || '') === 'method') reasons.push('方法类做K(028禁止)');
  return reasons.length ? reasons.join(' + ') : null;
}

console.log(`  明细文件：${file}`);
console.log(`  生成时间：${d.generatedAt}`);
console.log(`  语料：原始 ${d.corpus.raw} 条 → 去重 ${d.corpus.dedup} 道，可测 ${d.summary.n} 道`);

show('一、裸命中率（不看合规性）');
const s = d.summary;
const pct = (x) => `${(x / Math.max(1, s.n) * 100).toFixed(1)}%`;
console.log(`  Jev                ${s.jevOk}  ${pct(s.jevOk)}`);
console.log(`  字符匹配            ${s.charOk}  ${pct(s.charOk)}`);
console.log(`  → 表面上字符匹配更好`);

show('二、按「可合法记账」重新评分（决策 052 / 028）');
let jevLegal = 0, jevIllegal = 0, charLegal = 0, charIllegal = 0;
const jevReasons = {}, charReasons = {};
for (const r of d.rows) {
  if (r.err) continue;
  if (r.jevHit && r.jev && r.jev.name) {
    const bad = illegality(r.jev.name);
    if (bad) { jevIllegal++; jevReasons[bad] = (jevReasons[bad] || 0) + 1; } else jevLegal++;
  }
  if (r.charHit && r.charPick) {
    const bad = illegality(r.charPick);
    if (bad) { charIllegal++; charReasons[bad] = (charReasons[bad] || 0) + 1; } else charLegal++;
  }
}
console.log(`  Jev     合规 ${jevLegal}  违规 ${jevIllegal}   → 合规率 ${pct(jevLegal)}`);
console.log(`  字符     合规 ${charLegal}  违规 ${charIllegal}   → 合规率 ${pct(charLegal)}`);
console.log();
console.log('  字符匹配违规明细：');
Object.entries(charReasons).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`    ${k}  ×${v}`));
if (Object.keys(jevReasons).length) {
  console.log('  Jev 违规明细：');
  Object.entries(jevReasons).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`    ${k}  ×${v}`));
} else {
  console.log('  Jev 违规明细：无 —— Jev 的候选清单本身已排除父节点与方法类，结构上不会违规');
}

show('三、结论');
console.log(`
  ① 裸命中率：字符 92.7% vs Jev 78.2% —— 字符看似更好
  ② 合规率：  Jev ${pct(jevLegal)}（${jevLegal}/${s.n}） vs 字符 ${pct(charLegal)}（${charLegal}/${s.n}）
  ③ 字符匹配的「命中」里有 ${charIllegal} 题落在【明令禁止记账】的节点上
     （父节点直记 ${charReasons['父节点直记(052禁止)'] || 0} 题 + 方法类做K ${charReasons['方法类做K(028禁止)'] || 0} 题，含并列）
     —— 这些不是命中，是**记错账**：K 被记到父节点会让子节点证据被重复放大；
        方法类混进 K 会让「解题套路」被当成「知识本体掌握」。

  ④ Jev 未命的 12 题里，多数是它**主动选「其他/都不是」**（conf 0.33~0.85），
     即：它认为图谱里没有对应节点。这与 §6.1「图谱缺口被系统性漏掉」互相印证
     —— 这 12 题正是 node_requests 该收的料，而不是该硬塞一个节点。

  → 结论：**Jev 换掉字符匹配仍然是对的**，但理由不是「命中率更高」，而是
     「命中率略低、但命中的都是合法账；字符匹配的高命中率里 39% 是错账」。
     数值与方案文档写的「80.7% → 100%」不符 —— 文档那个 100% 是在**5 道精选题**上测的，
     真实 55 题语料上 Jev 是 78.2%。**已在交接文档更正这一条。**
`);
