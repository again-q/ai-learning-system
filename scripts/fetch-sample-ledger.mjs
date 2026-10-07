#!/usr/bin/env node
// 拉「本题用到的每个知识点」的真实账（考几次/对几次）→ 写进 sample-report-input.json 的 ledger 字段
// 用途：报告里「你的账」模块（跨题统计）不能用 AI 措辞，必须是可核验的机器数字
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tcb = path.join(ROOT, 'node_modules/.bin/tcb');
const ENV = process.env.TCB_ENV || 'cloud1-d8g0ty39wd73f430a';
function unwrap(v){ if(v===null||typeof v!=='object')return v; if(Array.isArray(v))return v.map(unwrap); const ks=Object.keys(v); if(ks.length===1){const k=ks[0]; if(/^\$(numberInt|numberLong|numberDouble)$/.test(k))return Number(v[k]); if(k==='$oid')return v[k]; if(k==='$date'){const x=v[k]; return typeof x==='number'?x:Number((x&&x.$numberLong)||0);}} const o={}; for(const k of ks)o[k]=unwrap(v[k]); return o; }
function q(table, cmd){ const payload=[{TableName:table,CommandType:'QUERY',Command:JSON.stringify(cmd)}];
  const raw=execFileSync(tcb,['db','nosql','execute','--json','-e',ENV,'--command',JSON.stringify(payload)],{cwd:ROOT,encoding:'utf8',timeout:300000,maxBuffer:1e8});
  const s=raw.indexOf('['), e=raw.lastIndexOf(']'); const arr=unwrap(JSON.parse(raw.slice(s,e+1))); const f=Array.isArray(arr)?arr[0]:null; return Array.isArray(f)?f:(f&&f.data)||[]; }
const p = path.join(ROOT,'output/golden/sample-report-input.json');
const d = JSON.parse(fs.readFileSync(p,'utf8'));
const nodes = q('knowledge_nodes',{find:'knowledge_nodes',filter:{},projection:{_id:1,knowledgeId:1,name:1,path:1},limit:1000});
const byName = {}; nodes.forEach(n=>{ byName[String(n.name||'').trim()] = n; });
const prog = q('knowledge_progress',{find:'knowledge_progress',filter:{},projection:{knowledgeNodeId:1,attempts:1,correctCount:1,mastery:1,evidence:1},limit:1000});
const byId = {}; prog.forEach(r=>{ byId[r.knowledgeNodeId] = r; });
const ledger = d.names.map(name => {
  const n = byName[name]; const id = n ? (n.knowledgeId || n._id) : null; const row = id ? byId[id] : null;
  return { name, nodeId: id, attempts: row ? (row.attempts||0) : 0, correctCount: row ? (row.correctCount||0) : 0, mastery: row ? (row.mastery!=null?row.mastery:null) : null, hasRow: !!row, unit: (n && Array.isArray(n.path) && n.path[2]) || null };
}).filter(x => x.hasRow).sort((a,b)=> (a.mastery==null?9:a.mastery) - (b.mastery==null?9:b.mastery));
const up = q('unit_progress',{find:'unit_progress',filter:{},projection:{unitName:1,aValue:1,aUpper:1,n:1},limit:1000});
const unit = d.up ? up.find(r=>r.unitName===d.up.unitName) || d.up : (up[0]||null);
d.ledger = ledger; d.unitRow = unit;
fs.writeFileSync(p, JSON.stringify(d, null, 1));
console.log('本题知识点 ' + d.names.length + ' 个，有账 ' + ledger.length + ' 个（按用对率升序）：');
ledger.forEach(x=>console.log('  ' + x.name.padEnd(14,' ') + ' 考 ' + x.attempts + ' 对 ' + x.correctCount + '  ' + (x.mastery!=null?('(' + Math.round(x.mastery*100) + '%)'):'')));
console.log('单元: ' + JSON.stringify(unit));
console.log('已写回 ' + path.relative(ROOT,p));