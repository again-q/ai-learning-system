#!/usr/bin/env node
// 补齐「本批每道题」的卡片数据 → d.cards[]（每题含：题面/过程分段/断点/参考过程/知识点账）
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tcb = path.join(ROOT, 'node_modules/.bin/tcb');
const ENV = process.env.TCB_ENV || 'cloud1-d8g0ty39wd73f430a';
function unwrap(v){ if(v===null||typeof v!=='object')return v; if(Array.isArray(v))return v.map(unwrap); const ks=Object.keys(v); if(ks.length===1){const k=ks[0]; if(/^\$(numberInt|numberLong|numberDouble)$/.test(k))return Number(v[k]); if(k==='$oid')return v[k]; if(k==='$date')return v[k];} const o={}; for(const k of ks)o[k]=unwrap(v[k]); return o; }
function q(table, cmd){ const payload=[{TableName:table,CommandType:'QUERY',Command:JSON.stringify(cmd)}];
  const raw=execFileSync(tcb,['db','nosql','execute','--json','-e',ENV,'--command',JSON.stringify(payload)],{cwd:ROOT,encoding:'utf8',timeout:300000,maxBuffer:1e8});
  const s=raw.indexOf('['), e=raw.lastIndexOf(']'); const arr=unwrap(JSON.parse(raw.slice(s,e+1))); const f=Array.isArray(arr)?arr[0]:null; return Array.isArray(f)?f:(f&&f.data)||[]; }
const p = path.join(ROOT,'output/golden/sample-report-input.json');
const d = JSON.parse(fs.readFileSync(p,'utf8'));
const batchId = d.pick.batchId;
const proj = { questionText:1, questionType:1, traceReport:1, segments:1, breakpoint:1, referenceProcess:1, knowledgeUsage:1, pattern:1, processScore:1, difficultyLevel:1, difficultyValue:1, errorLevel:1, errorType:1, processAvailable:1, createdAt:1, reviewed:1, batchId:1 };
const all = q('questions',{find:'questions',filter:{},projection:proj,limit:300}).filter(x=>x.batchId===batchId && x.reviewed===true);
const nodes = q('knowledge_nodes',{find:'knowledge_nodes',filter:{},projection:{_id:1,knowledgeId:1,name:1,path:1},limit:1000});
const prog = q('knowledge_progress',{find:'knowledge_progress',filter:{},projection:{knowledgeNodeId:1,attempts:1,correctCount:1,mastery:1,recent:1},limit:1000});
const byName = {}; nodes.forEach(n=>{ byName[String(n.name||'').trim()] = n; });
const byId = {}; prog.forEach(r=>{ byId[r.knowledgeNodeId] = r; });
const cards = all.map(x => {
  const names = (x.knowledgeUsage||[]).map(u=>String(u.name||'').trim()).filter(Boolean);
  const ledger = names.map(nm => { const n = byName[nm]; const id = n ? (n.knowledgeId||n._id) : null; const r = id ? byId[id] : null;
    return { name: nm, attempts: r?(r.attempts||0):0, correctCount: r?(r.correctCount||0):0, mastery: r&&r.mastery!=null?r.mastery:null, recent: r&&Array.isArray(r.recent)?r.recent:[] }; })
    .filter(z => z.attempts > 0).sort((a,b)=>(a.mastery==null?9:a.mastery)-(b.mastery==null?9:b.mastery));
  return { id: x._id || '', questionText: x.questionText||'', questionType: x.questionType||'', processScore: Number(x.processScore), difficultyValue: x.difficultyValue, difficultyLevel: x.difficultyLevel||'', segments: Array.isArray(x.segments)?x.segments:[], breakpoint: x.breakpoint||null, referenceProcess: Array.isArray(x.referenceProcess)?x.referenceProcess:[], knowledgeUsage: Array.isArray(x.knowledgeUsage)?x.knowledgeUsage:[], errorLevel: x.errorLevel||null, pattern: x.pattern||null, ledger };
});
d.cards = cards;
fs.writeFileSync(p, JSON.stringify(d,null,1));
console.log('本批 ' + batchId.slice(-6) + ' 共 ' + cards.length + ' 题：');
cards.forEach((c,i)=>console.log('  [' + (i+1) + '] P=' + c.processScore + ' 分段=' + c.segments.length + ' 参考步=' + c.referenceProcess.length + ' 知识点=' + c.knowledgeUsage.length + '(有账 ' + c.ledger.length + ') 断点=' + (c.breakpoint?c.breakpoint.nature:'—') + ' | ' + String(c.questionText).replace(/\s+/g,' ').slice(0,42)));
console.log('已写回 d.cards');