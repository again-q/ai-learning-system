#!/usr/bin/env node
// 生成「镜子原则」报告示例（HTML）——数据全部来自真实判定记录（身份信息不渲染）
// 用法：node scripts/render-sample-report.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tcb = path.join(ROOT, 'node_modules/.bin/tcb');
const ENV = process.env.TCB_ENV || 'cloud1-d8g0ty39wd73f430a';
function unwrap(v){ if(v===null||typeof v!=='object')return v; if(Array.isArray(v))return v.map(unwrap); const ks=Object.keys(v); if(ks.length===1){const k=ks[0]; if(/^\$(numberInt|numberLong|numberDouble)$/.test(k))return Number(v[k]); if(k==='$oid'||k==='$date')return v[k];} const o={}; for(const k of ks)o[k]=unwrap(v[k]); return o; }
function q(table, cmd){ const payload=[{TableName:table,CommandType:'QUERY',Command:JSON.stringify(cmd)}];
  const raw=execFileSync(tcb,['db','nosql','execute','--json','-e',ENV,'--command',JSON.stringify(payload)],{cwd:ROOT,encoding:'utf8',timeout:300000,maxBuffer:1e8});
  const s=raw.indexOf('['), e=raw.lastIndexOf(']'); const arr=unwrap(JSON.parse(raw.slice(s,e+1))); const f=Array.isArray(arr)?arr[0]:null; return Array.isArray(f)?f:(f&&f.data)||[]; }
const PROJ = { questionText:1, questionType:1, traceReport:1, segments:1, breakpoint:1, referenceProcess:1, knowledgeUsage:1, pattern:1, processScore:1, difficultyLevel:1, difficultyValue:1, errorLevel:1, errorAttribution:1, processAvailable:1, batchId:1, cropFileID:1 };
const all = q('questions', { find:'questions', filter:{}, projection:PROJ, limit:80 });
const pick = all.filter(r => Number(r.processScore) < 1 && Array.isArray(r.segments) && r.segments.length >= 2 && Array.isArray(r.referenceProcess) && r.referenceProcess.length >= 2)
  .sort((a,b)=> (b.segments.length - a.segments.length) || (b.referenceProcess.length - a.referenceProcess.length))[0];
if (!pick) { console.error('❌ 未找到同时有 segments 与 referenceProcess 的错题，样本数=' + all.length); process.exit(1); }
const batch = all.filter(r => r.batchId === pick.batchId).sort((a,b)=> String(a.questionText).localeCompare(String(b.questionText)));
const status = (p) => Number(p) >= 1 ? ['对','ok'] : (Number(p) > 0 ? ['半对','mid'] : ['错','bad']);
const dots = batch.map(r => status(r.processScore));
const names = (pick.knowledgeUsage||[]).map(u=>u.name).filter(Boolean);
let kp = null, up = null;
try {
  const nodes = q('knowledge_nodes', { find:'knowledge_nodes', filter:{}, projection:{_id:1,knowledgeId:1,name:1,path:1}, limit:1000 });
  const hit = nodes.find(n => names.includes(String(n.name||'').trim()));
  if (hit) {
    const id = hit.knowledgeId || hit._id;
    const rows = q('knowledge_progress', { find:'knowledge_progress', filter:{}, projection:{knowledgeNodeId:1,mastery:1,attempts:1,correctCount:1,evidence:1,aggregated:1}, limit:1000 }).filter(r => r.knowledgeNodeId === id);
    kp = rows[0] || null;
    const unit = Array.isArray(hit.path) && hit.path[2] ? hit.path[2] : null;
    if (unit) up = q('unit_progress', { find:'unit_progress', filter:{}, projection:{unitName:1,aValue:1,aUpper:1,n:1}, limit:1000 }).find(r => r.unitName === unit) || null;
  }
} catch (e) { console.warn('台账数据拉取失败（示例仍会生成）: ' + e.message); }
const out = { pick, batch: batch.length, dots, kp, up, names };
fs.mkdirSync(path.join(ROOT,'output/golden'), { recursive:true });
fs.writeFileSync(path.join(ROOT,'output/golden/sample-report-input.json'), JSON.stringify(out, null, 1));
console.log('选中题目:', String(pick.questionText||'').slice(0,50));
console.log('P=' + pick.processScore + ' 分段=' + pick.segments.length + ' 参考步=' + pick.referenceProcess.length + ' 断点=' + JSON.stringify(pick.breakpoint));
console.log('同批题数=' + batch.length + ' 点阵=' + dots.map(d=>d[0]).join(''));
console.log('知识点=' + JSON.stringify(names) + ' K账=' + JSON.stringify(kp) + ' A账=' + JSON.stringify(up));
console.log('已写 output/golden/sample-report-input.json');