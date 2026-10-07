#!/usr/bin/env node
// 拉「本批 vs 上一批」的真实三态对比 → 写进 sample-report-input.json 的 overall 字段
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
const ts = (x) => { if (x==null) return 0; if (typeof x==='number') return x; if (typeof x==='string') return Date.parse(x)||0; if (x.$numberLong) return Number(x.$numberLong); if (x.$date) return ts(x.$date); return 0; };
const p = path.join(ROOT, 'output/golden/sample-report-input.json');
const d = JSON.parse(fs.readFileSync(p,'utf8'));
const qs = q('questions',{find:'questions',filter:{},projection:{userId:1,batchId:1,processScore:1,createdAt:1,reviewed:1},limit:300}).filter(x=>x.reviewed===true);
const cnt = {}; qs.forEach(x=>{ cnt[x.userId]=(cnt[x.userId]||0)+1; });
const mainUser = Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0];
const mine = qs.filter(x=>x.userId===mainUser);
const byBatch = {};
mine.forEach(x=>{ const b=x.batchId||'?'; (byBatch[b]=byBatch[b]||[]).push(x); });
const batches = Object.keys(byBatch).map(b=>({ batchId:b, n:byBatch[b].length, t: Math.max.apply(null, byBatch[b].map(x=>ts(x.createdAt))) })).sort((a,b)=>b.t-a.t);
const tally = (rows) => { const r={total:rows.length, ok:0, mid:0, bad:0}; rows.forEach(x=>{ const v=Number(x.processScore); if(v>=1)r.ok++; else if(v>0)r.mid++; else r.bad++; }); return r; };
console.log('学生 ' + mainUser + ' 共 ' + mine.length + ' 题 / ' + batches.length + ' 批');
batches.slice(0,4).forEach(b=>console.log('  批次 ' + b.batchId.slice(-6) + ' ' + new Date(b.t).toISOString().slice(0,16) + ' → ' + JSON.stringify(tally(byBatch[b.batchId]))));
const cur = batches.find(b => b.batchId === d.pick.batchId) || batches[0];
const prev = batches.filter(b => b.t < cur.t)[0] || null;
d.overall = { curBatch: cur.batchId, cur: tally(byBatch[cur.batchId]), prev: prev ? { batchId: prev.batchId, date: new Date(prev.t).toISOString().slice(5,10), ...tally(byBatch[prev.batchId]) } : null };
fs.writeFileSync(p, JSON.stringify(d,null,1));
console.log('本批: ' + JSON.stringify(d.overall.cur) + ' | 上一批: ' + JSON.stringify(d.overall.prev));
console.log('已写回 ' + path.relative(ROOT,p));