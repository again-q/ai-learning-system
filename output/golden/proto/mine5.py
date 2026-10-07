#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""第四步（收敛）：
  A 分字段度量不稳定性：P 漂 vs errorLevel 漂（errorLevel 是「错因」字段，直接决定归因）
  B 按 case（不是按题面）重算语料构成
  C 重新验证 S1 错因传播链（题内跨段，不依赖跨 case 分组）
"""
import json, os, re, glob
from collections import defaultdict

RAW = os.path.join(os.path.dirname(__file__), '..', 'results', 'stability-raw')
pat = re.compile(r'^(?P<label>.+?)__(?P<case>.+?)__r(?P<round>\d+)\.json$')

groups = defaultdict(dict)
for p in glob.glob(os.path.join(RAW, '*.json')):
    m = pat.match(os.path.basename(p))
    if m:
        groups[(m.group('label'), m.group('case'))][int(m.group('round'))] = p

print('【A】跨轮分歧按字段拆开（同 label 同 case，同输入重复判定）')
agg = defaultdict(lambda: [0, 0, 0, 0])  # label -> [n, P漂, EL漂, 两者]
for (label, case), rp in groups.items():
    if len(rp) < 2:
        continue
    rows = []
    for r in sorted(rp):
        try:
            rows.append(json.load(open(rp[r], encoding='utf-8')))
        except Exception:
            pass
    if len(rows) < 2:
        continue
    Ps = {round(float(x.get('P') or 0), 2) for x in rows}
    EL = {str(x.get('errorLevel')) for x in rows}
    a = agg[label]
    a[0] += 1
    if len(Ps) > 1:
        a[1] += 1
    if len(EL) > 1:
        a[2] += 1
    if len(Ps) > 1 and len(EL) > 1:
        a[3] += 1
print('  %-14s %5s %8s %10s %8s' % ('label', 'case', 'P漂', 'errorLevel漂', '两者都漂'))
for label, a in sorted(agg.items(), key=lambda kv: -kv[1][0]):
    print('  %-14s %5d %8d %10d %8d' % (label, a[0], a[1], a[2], a[3]))

print()
print('【B】按 case 看语料构成（取每个 case 的第 1 轮，标签 old=旧壳全量 35 例）')
seen = {}
for (label, case), rp in groups.items():
    if label != 'old':
        continue
    try:
        seen[case] = json.load(open(rp[min(rp)], encoding='utf-8'))
    except Exception:
        pass
print('  old 的 case 数:', len(seen))
witherr = {k: v for k, v in seen.items() if float(v.get('P') or 0) < 1}
print('  判错(P<1) case:', len(witherr))
print('    其中 errorLevel=skill :', sum(1 for v in witherr.values() if v.get('errorLevel') == 'skill'))
print('    其中 errorLevel=rule  :', sum(1 for v in witherr.values() if v.get('errorLevel') == 'rule'))
print('    其中 errorLevel=concept:', sum(1 for v in witherr.values() if v.get('errorLevel') == 'concept'))
print('    其中 errorLevel=null  :', sum(1 for v in witherr.values() if not v.get('errorLevel')))
print('    其中有过程(segments):', sum(1 for v in witherr.values() if (v.get('segments') or [])))
print('    其中无过程(整题空白/选填):', sum(1 for v in witherr.values() if not (v.get('segments') or [])))
print('  角色分布:', {r: sum(1 for k in seen if k.endswith('__' + r)) for r in ['real', 'correct', 'wrong', 'blank', 'alt']})

print()
print('【C】S1 错因传播链复验（题内：断点之后仍继续写）')
for label in ['old', 'kat-v1', 'clean-after2']:
    n = hit = 0
    for (lb, case), rp in sorted(groups.items()):
        if lb != label:
            continue
        v = json.load(open(rp[min(rp)], encoding='utf-8'))
        segs = v.get('segments') or []
        if not segs:
            continue
        n += 1
        bp = (v.get('breakpoint') or {}).get('index')
        if bp and any((s.get('evidence') or '').strip() for i, s in enumerate(segs, 1) if i > bp):
            hit += 1
            print('   [%s] %s | P=%s errLvl=%s 断在第%s段/%d段 之后仍写'
                  % (label, case[:40], v.get('P'), v.get('errorLevel'), bp, len(segs)))
    if n:
        print('   → %s：有过程 %d 例，其中断点后继续写 %d 例' % (label, n, hit))
