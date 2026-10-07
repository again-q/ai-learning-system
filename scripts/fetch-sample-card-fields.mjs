#!/usr/bin/env node
// 补卡片字段：按时型展示需要「学生作答转录 / 正确答案 / 过程可信 / 题目类别」
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
const proj = { questionText:1, questionType:1, traceReport:1, correctAnswer:1, processAvailable:1, questionCategory:1, pattern:1, processScore:1, batchId:1, reviewed:1 };
const all = q('questions',{find:'questions',filter:{},projection:proj,limit:300}).filter(x=>x.batchId===batchId && x.reviewed===true);
const byText = {};
all.forEach(x => { byText[String(x.questionText||'').slice(0,60)] = x; });
let n = 0;
(d.cards||[]).forEach(c => {
  const m = byText[String(c.questionText||'').slice(0,60)] || {};
  c.traceReport = m.traceReport || '';
  c.correctAnswer = m.correctAnswer || '';
  c.processAvailable = m.processAvailable === true;
  c.questionCategory = m.questionCategory || '';
  c.pattern = c.pattern || m.pattern || null;
  n++;
});
fs.writeFileSync(p, JSON.stringify(d,null,1));
console.log('已补字段到 ' + n + ' 张卡：');
(d.cards||[]).forEach((c,i)=>console.log('  [' + (i+1) + '] ' + c.questionType + ' | 类别=' + c.questionCategory + ' | 作答=' + JSON.stringify(String(c.traceReport||'').slice(0,40)) + ' | 答案=' + JSON.stringify(String(c.correctAnswer||'').slice(0,40)) + ' | 过程可信=' + c.processAvailable));