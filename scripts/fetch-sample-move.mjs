#!/usr/bin/env node
// 为示例报告补「移动」证据（全部来自真实判定记录）：每个知识点的断点性质变化 / 最近一次 P / 历史最高 P
// 原则：只呈现事实（不下“你进步了”的结论）；且带“最近一次”，避免拿三个月前的旧账冤枉学生
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tcb = path.join(ROOT, 'node_modules/.bin/tcb');
const ENV = process.env.TCB_ENV || 'cloud1-d8g0ty39wd73f430a';
function unwrap(v){ if(v===null||typeof v!=='object')return v; if(Array.isArray(v))return v.map(unwrap); const ks=Object.keys(v); if(ks.length===1){const k=ks[0]; if(/^\$(numberInt|numberLong|numberDouble)$/.test(k))return Number(v[k]); if(k==='$oid')return v[k]; if(k==='$date')return v[k];} const o={}; for(const k of ks)o[k]=unwrap(v[k]); return o; }
function q(table, cmd){ const payload=[{TableName:table,CommandType:JSON.stringify?'QUERY':'QUERY',Command:JSON.stringify(cmd)}];
  const raw=execFileSync(tcb,['db','nosql','execute','--json','-e',ENV,'--command',JSON.stringify(payload)],{cwd:ROOT,encoding:'utf8',timeout:300000,maxBuffer:1e8});
  const s=raw.indexOf('['), e=raw.lastIndexOf(']'); const arr=unwrap(JSON.parse(raw.slice(s,e+1))); const f=Array.isArray(arr)?arr[0]:null; return Array.isArray(f)?f:(f&&f.data)||[]; }
const ts = (x) => { if (x==null) return 0; if (typeof x==='number') return x; if (typeof x==='string') return Date.parse(x)||0; if (x.$numberLong) return Number(x.$numberLong); if (x.$date) return ts(x.$date); return 0; };
const day = (x) => { const t = ts(x); return t ? new Date(t).toISOString().slice(5,10) : '?'; };
const p = path.join(ROOT, 'output/golden/sample-report-input.json');
const d = JSON.parse(fs.readFileSync(p,'utf8'));
const qs = q('questions',{find:'questions',filter:{},projection:{userId:1,knowledgeUsage:1,breakpoint:1,processScore:1,createdAt:1,reviewed:1},limit:300}).filter(x=>x.reviewed===true);
const cnt = {}; qs.forEach(x=>{ cnt[x.userId]=(cnt[x.userId]||0)+1; });
const mainUser = Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0];
console.log('学生分布 ' + JSON.stringify(cnt) + ' → 报告主体取题数最多的');
const mine = qs.filter(x=>x.userId===mainUser);
const move = [], ledgerPlus = [];
d.names.forEach(name => {
  const hits = mine.filter(x => (x.knowledgeUsage||[]).some(u=>String(u.name||'').trim()===name))
    .sort((a,b)=> ts(a.createdAt) - ts(b.createdAt));
  const withBp = hits.filter(x=>x.breakpoint && x.breakpoint.nature);
  const first = withBp[0], last = withBp[withBp.length-1];
  const ps = hits.map(x=>Number(x.processScore)).filter(Number.isFinite);
  const row = { name, times: hits.length, firstNature: first?first.breakpoint.nature:null, firstDay: first?day(first.createdAt):null, firstP: first?Number(first.processScore):null, lastNature: last?last.breakpoint.nature:null, lastDay: last?day(last.createdAt):null, lastP: ps.length?ps[ps.length-1]:null, maxP: ps.length?Math.max.apply(null,ps):null, lastBPindex: last?(last.breakpoint.index||null):null, recent: ps.slice(-3) };
  if (row.firstNature && row.lastNature && row.firstNature !== row.lastNature) move.push(row);
  ledgerPlus.push(row);
  console.log('  ' + name.padEnd(12,' ') + ' 出现 ' + row.times + ' 次 | ' + row.firstDay + ' ' + row.firstNature + ' → ' + row.lastDay + ' ' + row.lastNature + ' | 最近P=' + row.lastP + ' 最高P=' + row.maxP);
});
d.move = move; d.ledger = (d.ledger||[]).map(x => { const m = ledgerPlus.find(y=>y.name===x.name) || {}; return Object.assign({}, x, { times: m.times||0, lastP: m.lastP, maxP: m.maxP, lastDay: m.lastDay, recent: m.recent || [] }); });
d.moveUser = { userId: mainUser, questions: mine.length };
fs.writeFileSync(p, JSON.stringify(d, null, 1));
console.log('「移动」条目 ' + move.length + ' 个（性质发生过变化的）→ 已写回 ' + path.relative(ROOT,p));