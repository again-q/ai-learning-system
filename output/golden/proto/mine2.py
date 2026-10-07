#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""挖「难以发现的归因」的候选形态（第二步）。
形态候选：
  S1 错因传播链   同一题内，一处错后面的段仍带着它继续写（断点之后还有内容）
  S2 会但漏/锚点  同一知识点在不同题上一会儿 P=1 一会儿 P<1（单题看不出来）
  S3 掩盖结构     errorLevel=skill（算错/执行）但题里存在 P=0 的知识点环节（真正的缺失被算错掩盖）
  S4 同批同动作   本批多题断点性质/错误层级相同，指向同一个动作而非不同知识点
"""
import json, os, re, glob
from collections import defaultdict, Counter

RAW = os.path.join(os.path.dirname(__file__), '..', 'results', 'stability-raw')

def load():
    rows = []
    for p in glob.glob(os.path.join(RAW, '*.json')):
        try:
            d = json.load(open(p, encoding='utf-8'))
        except Exception:
            continue
        if isinstance(d, dict):
            d['_file'] = os.path.basename(p)
            rows.append(d)
    return rows

def nq(t):
    return re.sub(r'\s+', '', str(t or ''))[:60]

rows = load()
uniq = {}
for r in rows:
    k = nq(r.get('questionText'))
    if k not in uniq:
        uniq[k] = r

print('【语料概况】去重题 %d，判定记录 %d' % (len(uniq), len(rows)))
errs = [r for r in uniq.values() if r.get('P') is not None and float(r.get('P') or 0) < 1]
print('判错题 %d 道；其中「有过程」%d 道，「无过程(整题空白/选填)」%d 道'
      % (len(errs), sum(1 for r in errs if (r.get('segments') or [])), sum(1 for r in errs if not (r.get('segments') or []))))

print('\n【S1 错因传播链】有过程且判错的题，看断点之后是否还有内容')
for r in errs:
    segs = r.get('segments') or []
    if not segs:
        continue
    bp = r.get('breakpoint') or {}
    bi = bp.get('index')
    after = [s for i, s in enumerate(segs, 1) if bi and i > bi]
    cont = [s for s in after if (s.get('evidence') or '').strip()]
    print('  ·', (r.get('questionText') or '')[:22].replace('\n', ' '), '| P=%s errLvl=%s 断在第%s段/%d段'
          % (r.get('P'), r.get('errorLevel'), bi, len(segs)))
    print('      断点之后仍写了 %d 段 → 带着前面的错继续往下推' % len(cont))
    for s in cont[:3]:
        print('        [%s] %s' % (s.get('status'), (s.get('evidence') or '')[:70]))

print('\n【S2 会但漏 / 能力锚点】同一知识点在不同题上 P 不一致')
name_p = defaultdict(list)
for r in uniq.values():
    for u in (r.get('knowledgeUsage') or []):
        name_p[str(u.get('name'))].append((r, u.get('P')))
flip = {n: v for n, v in name_p.items() if len({p for _, p in v}) > 1}
print('  出现「同一知识点多种 P」的知识点：%d 个' % len(flip))
for n, v in sorted(flip.items(), key=lambda kv: -len(kv[1]))[:12]:
    ps = Counter(p for _, p in v)
    print('   · %-22s 出现 %d 次  P分布=%s' % (n[:22], len(v), dict(ps)))

print('\n【S3 掩盖结构】errorLevel=skill（判为执行/算错）但题内存在 P=0 环节')
n_hit = 0
for r in errs:
    if r.get('errorLevel') != 'skill':
        continue
    ku = r.get('knowledgeUsage') or []
    zeros = [u for u in ku if float(u.get('P') or 0) == 0]
    if zeros and (r.get('segments') or []):
        n_hit += 1
        print('  · %s | P=%s' % ((r.get('questionText') or '')[:26].replace('\n', ' '), r.get('P')))
        print('      被判为 skill（算错/执行）但 P=0 的环节：%s' % '、'.join(str(u.get('name')) for u in zeros))
print('  命中 %d 道（有过程才可判）' % n_hit)

print('\n【S4 同批同动作】判错题的「错误层级 × 断点性质」组合')
combo = Counter()
for r in errs:
    combo[(r.get('errorLevel'), (r.get('breakpoint') or {}).get('nature') or '无断点')] += 1
for k, v in combo.most_common():
    print('   %-28s %d 道' % ('%s / %s' % k, v))
