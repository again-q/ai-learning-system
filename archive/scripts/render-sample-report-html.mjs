#!/usr/bin/env node
// 渲染「镜子原则」报告示例 → doc/architecture/示例-镜子报告.html
// 组织原则：按题成卡（不是按段分区）——卡内一条竖线：0 看自己 → 1 你的账 → 2 差在哪 → 3 缺了什么 → 4 更像哪种 → 5 下次做什么
// 手机优先：单列、无并排两列；对照用上下两块 + 差异高亮。数据来自 output/golden/sample-report-input.json（真实判定记录）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const d = JSON.parse(fs.readFileSync(path.join(ROOT,'output/golden/sample-report-input.json'),'utf8'));
const p = d.pick;
const esc = (s) => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const SYM = {'Delta':'Δ','varnothing':'∅','neq':'≠','le':'≤','ge':'≥','subseteq':'⊆','subset':'⊂','in':'∈','notin':'∉','mid':'|','cdot':'·','times':'×','pm':'±','Rightarrow':'⇒','Leftrightarrow':'⇔','cup':'∪','cap':'∩','mathbf':'','text':'','quad':' ','qquad':'  '};
function tex(s){
  let t = esc(s);
  t = t.replace(/\\text\{([^{}]*)\}/g, '$1');
  t = t.replace(/\\mathbf\{([^{}]*)\}/g, '$1');
  t = t.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '<span class="fr"><i>$1</i><i>$2</i></span>');
  t = t.replace(/\^\{([^{}]+)\}/g, '<sup>$1</sup>').replace(/_\{([^{}]+)\}/g, '<sub>$1</sub>');
  t = t.replace(/\\left|\\right|\\,|\\;|\\!/g, '');
  t = t.replace(/\\([A-Za-z]+)/g, (m,k)=> (SYM[k]!=null ? SYM[k] : ''));
  t = t.replace(/\\\{/g,'{').replace(/\\\}/g,'}').replace(/\\/g,'');
  t = t.replace(/\$/g,'').replace(/\s+/g,' ').trim();
  return '<span class="tex">'+t+'</span>';
}
// 术语 → 学生的话（前端文案零术语；不新增口径，只做同义表达）
const pWord = (v) => (v==null?'':(v>=1?'做对了':(v>=0.8?'基本做对':(v>0?'做了一半':'没做出来'))));
const natureWord = (n) => (n==='起步即停'?'第一步没写出来':(n==='中途断'?'写到一半停了':(n==='收尾断'?'差最后一步':String(n||''))));
const dayCn = (s) => { const m=String(s||'').match(/^([0-9]{2})-([0-9]{2})$/); return m ? (Number(m[1])+'月'+Number(m[2])+'日') : String(s||''); };

const H = [];
H.push('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">');
H.push('<meta name="viewport" content="width=device-width,initial-scale=1">');
H.push('<title>诊断报告 · 示例</title><style>');
H.push(':root{--ink:#111827;--sub:#6b7280;--line:#e8eaed;--ok:#0f766e;--okbg:#eefaf7;--bad:#b42318;--badbg:#fef3f2;--mid:#b45309;--warnbg:#fffbeb}');
H.push('*{box-sizing:border-box}html,body{margin:0}body{background:#f5f6f8;color:var(--ink);font:15px/1.72 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased}');
H.push('.wrap{max-width:430px;margin:0 auto;background:#f5f6f8;padding:0 12px 32px}');
H.push('.top{position:sticky;top:0;z-index:9;background:rgba(245,246,248,.94);backdrop-filter:blur(8px);padding:14px 4px 10px;display:flex;align-items:baseline;gap:8px}');
H.push('.top b{font-size:17px;letter-spacing:.3px}.tag{font-size:11px;color:var(--sub);border:1px solid var(--line);border-radius:99px;padding:1px 8px;background:#fff}');
H.push('.sum{background:#fff;border-radius:14px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between}');
H.push('.dots{font-size:19px;letter-spacing:5px}.dot-ok{color:var(--ok)}.dot-mid{color:var(--mid)}.dot-bad{color:var(--bad)}');
H.push('.sum .n{font-size:13px;color:var(--sub)}');
H.push('.card{background:#fff;border-radius:14px;margin-top:12px;padding:16px 16px 6px}');
H.push('.card-h{display:flex;align-items:center;gap:8px;padding-bottom:12px;border-bottom:1px solid var(--line)}');
H.push('.card-h .no{font-weight:600;font-size:15px}');
H.push('.chip{font-size:11.5px;border-radius:99px;padding:1px 9px;border:1px solid var(--line);color:var(--sub)}');
H.push('.chip.mid{color:var(--mid);background:var(--warnbg);border-color:#fde3ae}');
H.push('.qtext{margin:12px 0 4px;font-size:15px;line-height:1.85;color:#111}');
H.push('.tex{font-family:Georgia,"Times New Roman",serif;font-style:italic}');
H.push('.fr{display:inline-flex;flex-direction:column;vertical-align:-0.5em;text-align:center;font-size:.85em;line-height:1.15;margin:0 3px}');
H.push('.fr i{font-style:normal;padding:0 4px}.fr i:first-child{border-bottom:1px solid currentColor}');
H.push('.rail{margin-top:14px;border-left:2px solid var(--line);padding-left:14px}');
H.push('.step{position:relative;padding-bottom:16px}');
H.push('.step:before{content:"";position:absolute;left:-21px;top:3px;width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid var(--ink)}');
H.push('.step-h{display:flex;align-items:baseline;gap:8px;font-weight:600;font-size:15px}');
H.push('.step-h .n{font-size:11px;color:#fff;background:var(--ink);border-radius:50%;width:17px;height:17px;display:inline-flex;align-items:center;justify-content:center;flex:none;transform:translateY(-1px)}');
H.push('.step-h .hint{font-weight:400;font-size:12px;color:var(--sub)}');
H.push('.block{margin-top:9px}');
H.push('.mine-note{font-size:12px;color:var(--sub);margin-bottom:6px}');
H.push('ol.mine{list-style:none;margin:0;padding:0}');
H.push('ol.mine li{display:flex;gap:8px;padding:6px 9px;border-radius:8px;margin-bottom:5px;font-size:14px}');
H.push('ol.mine .idx{color:var(--sub);font-size:12px;min-width:14px;flex:none;padding-top:1px}');
H.push('li.st-ok{background:var(--okbg)}li.st-ok .st{color:var(--ok)}');
H.push('li.st-bad{background:var(--badbg)}li.st-bad .st{color:var(--bad)}');
H.push('li.st-blank{background:#f3f4f6}li.st-blank .st{color:var(--sub)}');
H.push('.st{font-size:11px;flex:none;padding-top:1px}');
H.push('.diff{border-radius:10px;overflow:hidden;border:1px solid var(--line)}');
H.push('.side{padding:10px 11px;font-size:14px}');
H.push('.side.you{background:var(--badbg)}.side.ref{background:var(--okbg)}');
H.push('.side .lab{display:block;font-size:11.5px;color:var(--sub);margin-bottom:3px}');
H.push('.side p{margin:0}');
H.push('.sep{display:flex;align-items:center;gap:7px;padding:3px 11px;font-size:11px;color:var(--sub);background:#fff}');
H.push('.sep:before,.sep:after{content:"";height:1px;background:var(--line);flex:1}');
H.push('.cand{border:1px solid var(--line);border-radius:10px;padding:10px 11px;margin-bottom:7px;display:flex;gap:9px;font-size:14px;cursor:pointer}');
H.push('.cand.on{border-color:#111;background:#fafafa}');
H.push('.cand .r{width:15px;height:15px;border:1.5px solid #9ca3af;border-radius:50%;flex:none;margin-top:4px}');
H.push('.cand.on .r{border-color:#111;background:#111;box-shadow:inset 0 0 0 3px #fff}');
H.push('.cand .ev{display:block;font-size:11.5px;color:var(--sub);margin-top:3px}');
H.push('.act{border-left:2px solid var(--ink);padding:2px 0 2px 11px;margin-bottom:11px;font-size:14px}');
H.push('.act .why{display:block;font-size:11.5px;color:var(--sub);margin-top:2px}');
H.push('details{margin-top:8px}summary{font-size:12.5px;color:var(--sub);cursor:pointer;list-style:none}');
H.push('summary::-webkit-details-marker{display:none}summary:before{content:"＋ ";font-size:11px}');
H.push('details[open] summary:before{content:"－ "}');
H.push('textarea{width:100%;border:1px solid var(--line);border-radius:9px;padding:8px 9px;font:14px/1.6 inherit;min-height:52px;margin-top:6px}');
H.push('.btn{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);background:#fff;border-radius:99px;padding:6px 13px;font-size:12.5px;color:var(--sub);margin-top:4px;cursor:pointer}');
H.push('.fold{background:#fafafa;border:1px solid var(--line);border-radius:9px;padding:8px 10px;font-size:12.5px;color:var(--sub);margin-top:8px}');
H.push('.led{margin-top:12px;background:#fff;border-radius:14px;padding:14px 16px}');
H.push('.led .t{font-weight:600;font-size:15px;margin-bottom:2px}.led .h{font-size:12px;color:var(--sub);margin-bottom:10px}');
H.push('.row{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px dashed var(--line);font-size:14px}');
H.push('.row:last-child{border:0}.row .v{color:var(--sub);flex:none}');
H.push('.acct{margin-top:4px}.a-row{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13.5px}');
H.push('.a-name{min-width:118px;flex:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}');
H.push('.bar{flex:1;height:6px;background:#f1f2f4;border-radius:99px;overflow:hidden}.bar i{display:block;height:100%;background:var(--ink);border-radius:99px}');
H.push('.a-num{font-size:12px;color:var(--sub);flex:none;font-variant-numeric:tabular-nums}');
H.push('.guess{margin-top:10px;border:1px solid #e5d9f2;background:#faf7ff;border-radius:10px;padding:11px 12px}');
H.push('.guess .g-t{font-weight:600;font-size:13.5px;color:#5b21b6}');
H.push('.guess .g-b{font-size:13.5px;margin-top:5px;line-height:1.7}');
H.push('.guess .g-e{font-size:11.5px;color:var(--sub);margin-top:6px}');
H.push('.guess .g-a{margin-top:8px;display:flex;gap:8px;flex-wrap:wrap}');
H.push('.guess .g-a span{border:1px solid #ddd6fe;background:#fff;border-radius:99px;padding:3px 11px;font-size:12.5px;color:#5b21b6;cursor:pointer}');
H.push('.mini{display:inline-flex;gap:3px;vertical-align:middle}');
H.push('.mini i{width:10px;height:10px;border-radius:2px;background:#e5e7eb;display:block}');
H.push('.mini i.p1{background:var(--ok)}.mini i.p05{background:#f0b429}');
H.push('.sub-row{padding-top:0!important;font-size:12px}');
H.push('.mv{background:#f0fdf7;border:1px solid #cdece0;border-radius:12px;padding:11px 13px;margin-top:10px}');
H.push('.mv .t{font-weight:600;font-size:14px;color:#0f766e}.mv .r{font-size:13px;margin-top:5px;color:#134e4a}');
H.push('.mv .e{font-size:11.5px;color:var(--sub);margin-top:6px}');
H.push('.foot{font-size:11.5px;color:var(--sub);padding:14px 4px 0;line-height:1.7}');
H.push('</style></head><body><div class="wrap">');
H.push('<div class="top"><b>诊断报告</b><span class="tag">示例</span></div>');

H.push('<div class="sum"><span class="dots">'+d.dots.map(s=>'<span class="dot-'+s[1]+'">'+(s[0]==='对'?'✓':(s[0]==='半对'?'△':'✗'))+'</span>').join('')+'</span>');
H.push('<span class="n">本批 '+d.batch+' 题 · 半对 '+d.dots.filter(s=>s[0]==='半对').length+' 道</span></div>');
if (d.move && d.move.length) {
  H.push('<div class="mv"><div class="t">和上次比</div>');
  d.move.forEach(m=>H.push('<div class="r"><b>'+esc(m.name)+'</b>：'+dayCn(m.firstDay)+' '+natureWord(m.firstNature)+'，'+dayCn(m.lastDay)+' '+natureWord(m.lastNature)+'，最近一次'+pWord(m.lastP)+'</div>'));
  H.push('</div>');
}
H.push('<article class="card">');
const bp = p.breakpoint || {};
H.push('<div class="card-h"><span class="no">第 7 题</span><span class="chip mid">半对</span>'+(bp.nature?('<span class="chip">断在第 '+bp.index+' 段 · '+esc(bp.nature)+'</span>'):'')+'</div>');
H.push('<div class="qtext">'+tex(p.questionText)+'</div>');
H.push('<div class="rail">');

// 0 先看你自己
H.push('<div class="step"><div class="step-h"><span class="n">0</span>先看你自己<span class="hint">没有 AI 的话</span></div>');
H.push('<div class="block"><div class="mine-note">你的作答过程（原样转录，共 '+p.segments.length+' 段）</div><ol class="mine">');
const segLines = p.segments.map((s,i)=>{ const st = s.status==='通'?'ok':(s.status==='断'?'bad':'blank');
  return '<li class="st-'+st+'"><span class="idx">'+(i+1)+'</span><span class="st">'+esc(s.status)+'</span><span>'+tex(s.evidence||s.step||'')+'</span></li>'; });
H.push(segLines.slice(0,5).join(''));
H.push('</ol>');
if (segLines.length > 5) { H.push('<details><summary>展开其余 '+(segLines.length-5)+' 段</summary><ol class="mine" style="margin-top:6px">'+segLines.slice(5).join('')+'</ol></details>'); }
H.push('</div></div>');

// 1 差在哪
H.push('<div class="step"><div class="step-h"><span class="n">1</span>你的账<span class="hint">跨题统计 · 你自己看不到的部分</span></div>');
H.push('<div class="block"><div class="mine-note">这一题用到的 '+d.ledger.length+' 个知识点，按你的历史用对率排序（点开可看是哪几道题）</div><div class="acct">');
d.ledger.forEach(x=>{ var pct = x.mastery!=null?Math.max(3,Math.round(x.mastery*100)):0;
  var mins = (x.recent||[]).map(v=>'<i class="'+(v>=1?'p1':(v>0?'p05':''))+'"></i>').join('');
  H.push('<div class="a-row"><span class="a-name">'+esc(x.name)+'</span><span class="bar"><i style="width:'+pct+'%"></i></span><span class="a-num">'+x.attempts+' 次里对过 '+x.correctCount+' 次</span></div>');
  if (mins) H.push('<div class="a-row sub-row"><span class="a-name" style="color:var(--sub)">最近 3 次</span><span class="mini">'+mins+'</span><span class="a-num">最近一次'+pWord(x.lastP)+'</span></div>');
});
H.push('</div>');
const Ps = (p.knowledgeUsage||[]).map(u=>u.P);
if (Ps.length) H.push('<div class="mine-note" style="margin-top:8px">这题 '+Ps.length+' 个环节：'+(Ps.every(v=>v===Ps[0])?('全部 <b>'+Ps[0]+'</b>（用了但不完整）'):Ps.join(' · '))+'</div>');
H.push('</div></div>');
H.push('<div class="step"><div class="step-h"><span class="n">2</span>差在哪<span class="hint">只对照，不解释</span></div>');
H.push('<div class="block">');
const pairs = [[2,3,'第 3 段','第 4 步'],[8,6,'第 9 段','第 7 步']];
pairs.forEach(([si,ri,sl,rl])=>{ const s=p.segments[si]||{}, r=p.referenceProcess[ri]||{};
  H.push('<div class="diff">');
  H.push('<div class="side you"><span class="lab">你写的 · '+sl+'</span><p>'+tex(s.evidence||'')+'</p></div>');
  H.push('<div class="sep">对照</div>');
  H.push('<div class="side ref"><span class="lab">参考答案 · '+rl+'</span><p>'+tex(r.content||'')+'</p></div>');
  H.push('</div>');
  if (pairs.indexOf([si,ri,sl,rl])<pairs.length-1) H.push('<div style="height:10px"></div>');
});
H.push('<details><summary>看完整参考过程（'+p.referenceProcess.length+' 步）</summary><ol class="mine" style="margin-top:6px">');
p.referenceProcess.forEach((s,i)=>H.push('<li><span class="idx">'+(i+1)+'</span><span><b>'+tex(s.step||'')+'</b><br>'+tex(s.content||'')+'</span></li>'));
H.push('</ol></details>');
H.push('</div></div>');

// 2 更像哪种
// 3 缺了什么
H.push('<div class="step"><div class="step-h"><span class="n">3</span>缺了什么<span class="hint">对着参考过程看，不猜</span></div>');
H.push('<div class="block">');
H.push('<div class="mine-note">两处对不上（都能点回原文）</div>');
H.push('<div class="diff"><div class="side you"><span class="lab">你写的 · 第 5 段</span><p>'+tex((p.segments[4]||{}).evidence||'')+'</p></div><div class="sep">对照</div><div class="side ref"><span class="lab">参考答案 · 第 5 步（做了这一步）</span><p>'+tex((p.referenceProcess[4]||{}).content||'')+'</p></div></div>');
H.push('<div style="height:10px"></div>');
H.push('<div class="mine-note">你第 5 段提到「B=∅」，但没有把这一支算成 a 的范围；参考过程把它算完了 → 这一支在你的过程里<b>缺一个结论</b></div>');
H.push('<div class="guess"><div class="g-t">一个推测（你可以否掉）</div>');
H.push('<div class="g-b">这次判定属于<b>步骤/方法错</b>，不是概念没懂。判别式、韦达定理你都写出来了 —— 缺的是<b>把情况分完之后，回头检查边界有没有覆盖</b>。所以这一处更像 <b>「分析推理」</b>，不是「知识没记住」。</div>');
H.push('<div class="g-e">依据：你的第 5 段 = 「当 B=∅ 时，判别式小于0」（提了没算）；参考第 5 步给出了 B=∅ 时 a 的范围</div>');
H.push('<div class="g-a"><span>我同意</span><span>更像 K</span><span>不对，是别的原因</span></div></div>');
H.push('</div></div>');
H.push('<div class="step"><div class="step-h"><span class="n">4</span>更像哪种<span class="hint">你判断，AI 只给候选</span></div>');
H.push('<div class="block">');
H.push('<div class="cand" onclick="pick(this)"><span class="r"></span><span>判别式那一步算错了：Δ=a²−4(a−1)² 的展开/求解有误<span class="ev">证据 → 第 2 段原文</span></span></div>');
H.push('<div class="cand" onclick="pick(this)"><span class="r"></span><span>第 (1) 问结论错了，第 (2) 问又直接沿用了它<span class="ev">证据 → 第 3 段 vs 参考第 4 步</span></span></div>');
H.push('<div class="cand" onclick="pick(this)"><span class="r"></span><span>知道要讨论 B=∅，但三种情况没走完<span class="ev">证据 → 第 5 段写了「B=∅ 时判别式小于 0」，之后没有分类结论</span></span></div>');
H.push('<div class="cand" onclick="pick(this)"><span class="r"></span><span>以上都不是，我自己写<textarea placeholder="一句话说这一段的实际情况"></textarea></span></div>');
H.push('<button class="btn" onclick="reject()">我不同意这里的判定</button><div id="rej" class="fold" style="display:none">已记录你的异议 —— 会进入复核，改动回到报告里。</div>');
H.push('</div></div>');

H.push('<div class="step" style="padding-bottom:2px"><div class="step-h"><span class="n">5</span>下次先做什么</div>');
H.push('<div class="block">');
H.push('<div class="act">只重写第 2 段这一步：把 Δ=a²−4(a−1)² 展开成 3a²−8a+4，再解一次<span class="why">依据 → 第 1 节两组对照的差异都在这里</span></div>');
H.push('<div class="act">第 (1) 问按「a−1=0 与 a−1≠0 分开 → 各自对 Δ 下结论」重排顺序<span class="why">依据 → 第 1、2 段已是两条分支，缺的是分开写</span></div>');
H.push('<div class="act">下次遇到 B⊆A：先把「B=∅」单独写一行，再写另外两种<span class="why">依据 → 第 5 段提了空集，后面没有对应结论</span></div>');
H.push('</div></div>');
H.push('</div></article>');

// 台账
H.push('<div class="led"><div class="t">这些结论凭什么</div><div class="h">每条都能点回证据；证据不够就不给结论</div>');
H.push('<div class="row"><span>第 2 节的对照</span><span class="v">你的原文 ↔ 参考过程（可点开）</span></div>');
// —
if (d.up) H.push('<div class="row"><span>单元「'+esc(d.up.unitName)+'」熟练度</span><span class="v">样本 '+(d.up.n||0)+' 次 → 样本不足</span></div>');
H.push('<div class="row"><span>第 1 节的账</span><span class="v">共 '+d.ledger.reduce((s,x)=>s+x.attempts,0)+' 次作答记录</span></div>');
H.push('</div>');
H.push('<div class="foot">示例数据取自真实判定记录（不显示身份信息）。</div>');
H.push('</div><script>');
H.push('function pick(el){var on=el.classList.contains("on");document.querySelectorAll(".cand").forEach(function(c){c.classList.remove("on")});if(!on)el.classList.add("on");}');
H.push('function reject(){document.getElementById("rej").style.display="block";}');
H.push('</script></body></html>');
const html = H.join('\n');
const outPath = path.join(ROOT,'doc/architecture/示例-镜子报告.html');
fs.writeFileSync(outPath, html);
console.log('已生成 ' + path.relative(ROOT,outPath) + '｜' + (html.length/1024).toFixed(1) + ' KB｜' + html.split('\n').length + ' 行');
console.log('自检：题目卡片 ' + (html.match(/class="card"/g)||[]).length + '｜步骤 ' + (html.match(/class="step"/g)||[]).length + '｜对照块 ' + (html.match(/class="diff"/g)||[]).length + '｜候选 ' + (html.match(/class="cand"/g)||[]).length + '｜动作 ' + (html.match(/class="act"/g)||[]).length + '｜外链 ' + ((html.match(/https?:\/\//g)||[]).length) + '｜旧版残留 ' + (html.match(/旧版/g)||[]).length);