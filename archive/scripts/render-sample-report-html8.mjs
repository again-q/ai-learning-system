#!/usr/bin/env node
// 渲染「镜子原则」报告示例 → doc/architecture/示例-镜子报告.html
// 组织原则：按题成卡；卡内一条竖线：0 看自己 → 1 你的账 → 2 差在哪 → 3 缺了什么 · 一个推测 → 4 下次做什么
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
  t = t.replace(/\\binom\{([^{}]*)\}\{([^{}]*)\}/g, 'C($1,$2)');
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
H.push('.sec{list-style:none}.sec>summary{list-style:none;cursor:pointer}');
H.push('.sec>summary::-webkit-details-marker{display:none}');
H.push('.sec>summary:before{content:"▸";color:var(--sub);font-size:11px;margin-right:4px}');
H.push('.sec[open]>summary:before{content:"▾"}');
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
H.push('.side.you.mid{background:var(--warnbg);border-color:#fde3ae}');
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
H.push('.card>summary{list-style:none;cursor:pointer}.card>summary::-webkit-details-marker{display:none}');
H.push('.card>summary:before{content:"▾";color:var(--sub);font-size:12px;margin-right:6px}');
H.push('.card:not([open])>summary:before{content:"▸"}');
H.push('</style></head><body><div class="wrap">');
// ===================== 顶部：摘要 =====================
H.push('<div class="top"><b>诊断报告</b><span class="tag">示例</span></div>');
H.push('<div class="sum"><span class="dots">'+d.dots.map(s=>'<span class="dot-'+s[1]+'">'+(s[0]==='对'?'✓':(s[0]==='半对'?'△':'✗'))+'</span>').join('')+'</span></div>');
if (d.overall && d.overall.prev) H.push('<div class="mv"><div class="r">这次 '+d.overall.cur.total+' 题：半对 '+d.overall.cur.mid+' 道　｜　上次（'+d.overall.prev.date+'）'+d.overall.prev.total+' 题：半对 '+d.overall.prev.mid+' 道</div><div class="e">整体和上次一样，但同一个知识点的过程在往前挪</div></div>');
if (d.move && d.move.length) { H.push('<div class="mv"><div class="t">和上次比</div>'); d.move.forEach(m=>H.push('<div class="r"><b>'+esc(m.name)+'</b>：'+dayCn(m.firstDay)+' '+natureWord(m.firstNature)+'，'+dayCn(m.lastDay)+' '+natureWord(m.lastNature)+'，最近一次'+pWord(m.lastP)+'</div>')); H.push('</div>'); }

// ===================== 逐题卡片（每道题都有卡；深度取决于该题的数据）=====================
const acctRow = (x) => {
  var mins = (x.recent||[]).map(v=>'<i class="'+(v>=1?'p1':(v>0?'p05':''))+'"></i>').join('');
  return '<div class="a-row"><span class="a-name">'+esc(x.name)+'</span><span class="mini">'+mins+'</span><span class="a-num">近 3 次 · 最近一次'+pWord(x.lastP!=null?x.lastP:(x.recent&&x.recent.length?x.recent[x.recent.length-1]:null))+'</span></div>'
    + '<div class="a-row sub-row"><span class="a-name" style="color:var(--sub)">累计</span><span class="a-num" style="flex:1;text-align:right;color:var(--sub)">'+x.attempts+' 次里对过 '+x.correctCount+' 次</span></div>';
};
(d.cards||[]).forEach((c, ci) => {
  const st = c.processScore >= 1 ? ['对','ok'] : (c.processScore > 0 ? ['半对','mid'] : ['错','bad']);
  const bp = c.breakpoint || {};
  const isPick = c.id === (p._id || p.id);
  H.push('<details class="card"' + (ci === 0 ? ' open' : '') + '>');
  H.push('<summary class="card-h"><span class="no">第 ' + (ci+1) + ' 题</span><span class="chip ' + st[1] + '">' + st[0] + '</span>' + (bp.nature ? '<span class="chip">断在第 ' + bp.index + ' 段 · ' + esc(natureWord(bp.nature)) + '</span>' : '') + '</summary>');
  H.push('<div class="qtext">' + tex(c.questionText) + '</div>');
  H.push('<div class="rail">');

  // 0 先看你自己 —— 解答题看过程；选填题看作答与判定（不同类型不同展示）
  if (c.questionType === '解答') {
    H.push('<details class="sec"' + (ci === 0 ? ' open' : '') + '><summary class="step-h"><span class="n">0</span>先看你自己<span class="hint">没有 AI 的话</span></summary>');
    if (c.segments.length) {
      H.push('<div class="block"><div class="mine-note">你的作答过程（原样转录，共 ' + c.segments.length + ' 段）' + (c.processAvailable ? '' : ' · 过程转录不够清晰，仅供参考') + '</div><ol class="mine">');
      const segHtml = c.segments.map((s,i)=>{ const k = s.status==='通'?'ok':(s.status==='断'?'bad':'blank'); return '<li class="st-'+k+'"><span class="idx">'+(i+1)+'</span><span class="st">'+esc(s.status)+'</span><span>'+tex(s.evidence||s.step||'')+'</span></li>'; });
      H.push(segHtml.slice(0,5).join(''));
      H.push('</ol>');
      if (segHtml.length > 5) H.push('<details><summary>展开其余 ' + (segHtml.length-5) + ' 段</summary><ol class="mine" style="margin-top:6px">' + segHtml.slice(5).join('') + '</ol></details>');
      H.push('</div>');
    } else {
      H.push('<div class="block"><div class="mine-note">这道解答题没有过程分段：整题空白，或过程没转录上</div></div>');
    }
    H.push('</details>');
  } else {
    H.push('<details class="sec"' + (ci === 0 ? ' open' : '') + '><summary class="step-h"><span class="n">0</span>这道题的信息<span class="hint">选填题没有过程可看</span></summary>');
    H.push('<div class="block">');
    H.push('<div class="mine-note">你的作答：<b>' + (c.traceReport ? tex(String(c.traceReport).slice(0,120)) : '（没有转录到作答）') + '</b></div>');
    H.push('<div class="mine-note">这题用到的知识点：' + ((c.knowledgeUsage||[]).map(u=>esc(String(u.name||''))).join(' · ') || '—') + '</div>');
    H.push('</div></details>');
  }
  // 1 你的账（本题用到的知识点）
  H.push('<details class="sec"><summary class="step-h"><span class="n">1</span>你的账<span class="hint">跨题统计 · 你自己看不到的部分</span></summary>');
  H.push('<div class="block">');
  if (c.ledger.length) {
    H.push('<div class="mine-note">这道题用到的 ' + c.ledger.length + ' 个知识点，按你的历史用对率排序</div><div class="acct">');
    c.ledger.slice(0,2).forEach(x=>H.push(acctRow(x)));
    H.push('</div>');
    if (c.ledger.length > 2) { H.push('<details><summary>展开其余 ' + (c.ledger.length-2) + ' 个知识点</summary><div class="acct" style="margin-top:6px">'); c.ledger.slice(2).forEach(x=>H.push(acctRow(x))); H.push('</div></details>'); }
  } else {
    H.push('<div class="mine-note">这道题的知识点还没有历史记录</div>');
  }
  const Ps = (c.knowledgeUsage||[]).map(u=>u.P);
  if (Ps.length) H.push('<div class="mine-note" style="margin-top:8px">这题 ' + Ps.length + ' 个环节：' + (c.knowledgeUsage||[]).map(u=>esc(String(u.name||''))+' <b>'+u.P+'</b>').join(' · ') + '</div>');
  H.push('</div></details>');

  // 2 差在哪 —— 解答题做过程对照；选填题直接给参考过程
  if (c.referenceProcess.length) {
    const canCompare = c.questionType === '解答' && bp.index && c.segments[bp.index - 1];
    H.push('<details class="sec"><summary class="step-h"><span class="n">2</span>' + (canCompare ? '差在哪' : '参考过程') + '<span class="hint">' + (canCompare ? '只对照，不解释' : '这道题的标准做法') + '</span></summary>');
    H.push('<div class="block">');
    if (canCompare) {
      const s = c.segments[bp.index - 1], ri = Math.min(bp.index - 1, c.referenceProcess.length - 1), r = c.referenceProcess[ri] || {};
      const mid = (s.status === '断' && !isPick) ? ' mid' : '';
      H.push('<div class="diff"><div class="side you' + mid + '"><span class="lab">你写的 · 第 ' + bp.index + ' 段</span><p>' + tex(s.evidence||'') + '</p></div>');
      H.push('<div class="sep">对照</div>');
      H.push('<div class="side ref"><span class="lab">参考答案 · 第 ' + (ri+1) + ' 步</span><p>' + tex(r.content||'') + '</p></div></div>');
    }
    H.push('<details><summary>看完整参考过程（' + c.referenceProcess.length + ' 步）</summary><ol class="mine" style="margin-top:6px">');
    c.referenceProcess.forEach((s,i)=>H.push('<li><span class="idx">'+(i+1)+'</span><span><b>'+tex(s.step||'')+'</b><br>'+tex(s.content||'')+'</span></li>'));
    H.push('</ol></details>');
    H.push('</div></details>');
  }
  // 3 缺了什么 · 一个推测（目前只有这道题有生成结果）
  if (isPick) {
    H.push('<details class="sec"><summary class="step-h"><span class="n">3</span>缺了什么 · 一个推测<span class="hint">对着参考过程看，不猜</span></summary>');
    H.push('<div class="block"><div class="mine-note">一处对不上（B=∅ 那一支）</div>');
    H.push('<div class="diff"><div class="side you mid"><span class="lab">你写的 · 第 5 段</span><p>'+tex((c.segments[4]||{}).evidence||'')+'</p></div><div class="sep">对照</div><div class="side ref"><span class="lab">参考答案 · 第 5 步（做了这一步）</span><p>'+tex((c.referenceProcess[4]||{}).content||'')+'</p></div></div>');
    H.push('<div class="guess" style="margin-top:10px"><div class="g-t">一个推测（你可以否掉）</div>');
    H.push('<div class="g-b">两个候选，各带证据 —— 你看更像哪个：</div>');
    H.push('<div class="cand" onclick="pick(this)"><span class="r"></span><span><b>A</b> 分完情况后没回头查边界<span class="ev">依据 → 第 5 段提了「B=∅ 时判别式小于 0」，但没有把这一支算成 a 的范围</span></span></div>');
    H.push('<div class="cand" onclick="pick(this)"><span class="r"></span><span><b>B</b> 判别式那一步算错，后面都跟着偏<span class="ev">依据 → 第 3 段结论 {1, 1/3, 4} vs 参考第 4 步 {1, 2/3, 2}</span></span></div>');
    H.push('<div class="cand" onclick="pick(this)"><span class="r"></span><span>都不是，我自己写<textarea placeholder="一句话说这一段的实际情况"></textarea></span></div>');
    H.push('<div class="g-a"><span>选 A</span><span>选 B</span><span>都不是</span></div></div></div></details>');

    H.push('<details class="sec"><summary class="step-h"><span class="n">4</span>下次先做什么</summary><div class="block">');
    H.push('<div class="act">只重写第 2 段这一步：把 Δ=a²−4(a−1)² 展开成 3a²−8a+4，再解一次<span class="why">依据 → 上面「差在哪」那组对照的差异都在这里</span></div>');
    H.push('<div class="act">第 (1) 问按「a−1=0 与 a−1≠0 分开 → 各自对 Δ 下结论」重排顺序<span class="why">依据 → 你的第 1、2 段已是两条分支，缺的是分开写</span></div>');
    H.push('<div class="act">下次遇到 B⊆A：先把「B=∅」单独写一行，再写另外两种<span class="why">依据 → 第 5 段提了空集，后面没有对应结论</span></div>');
    H.push('</div></details>');
  }

  H.push('</div></details>');
});

// ===================== 这些结论凭什么 =====================
H.push('<div class="led"><div class="t">这些结论凭什么</div><div class="h">每条都能点回证据；证据不够就不给结论</div>');
H.push('<div class="row"><span>每道题的对照</span><span class="v">你的原文 ↔ 参考过程（可点开）</span></div>');
H.push('<div class="row"><span>你的账</span><span class="v">共 '+d.ledger.reduce((s,x)=>s+x.attempts,0)+' 次作答记录</span></div>');
H.push('<div class="row"><span>单元熟练度</span><span class="v">样本 '+(d.unitRow?(d.unitRow.n||0):0)+' 次 → 样本不足</span></div>');
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