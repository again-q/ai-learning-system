#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""V2 重做：正确的稳定性度量。
文件名 = <label>__<id>__<role>__r<round>.json
同一个 case 的多次判定 = 同 (label, id, role) 下的不同 r<N>。
之前按 questionText 分组是错的：同题面不同 trace 属于不同 case，P 不同是预期的。
"""
import json, os, re, glob
from collections import defaultdict

RAW = os.path.join(os.path.dirname(__file__), '..', 'results', 'stability-raw')

pat = re.compile(r'^(?P<label>.+?)__(?P<case>.+?)__r(?P<round>\d+)\.json$')
groups = defaultdict(dict)
for p in glob.glob(os.path.join(RAW, '*.json')):
    m = pat.match(os.path.basename(p))
    if not m:
        continue
    groups[(m.group('label'), m.group('case'))][int(m.group('round'))] = p

print('case 组数（label × case）:', len(groups))
multi = {k: v for k, v in groups.items() if len(v) > 1}
print('有 ≥2 轮可比的 case:', len(multi))

# 同 label 内跨轮比较（真正的重复判定）
unstable = []
for (label, case), rp in sorted(multi.items()):
    rows = []
    for r in sorted(rp):
        try:
            rows.append(json.load(open(rp[r], encoding='utf-8')))
        except Exception:
            pass
    if len(rows) < 2:
        continue
    Ps = [round(float(x.get('P') or 0), 2) for x in rows]
    EL = [x.get('errorLevel') for x in rows]
    ET = [x.get('errorType') for x in rows]
    if len(set(Ps)) > 1 or len(set(map(str, EL))) > 1:
        unstable.append((label, case, Ps, EL, ET, rows))

print('同 label 同 case 跨轮出现分歧:', len(unstable))
for label, case, Ps, EL, ET, rows in unstable[:15]:
    print('  · [%s] %s' % (label, case[:46]))
    print('      P=%s  errorLevel=%s  errorType=%s' % (Ps, [str(e) for e in EL], [str(e) for e in ET]))

# 汇总：每个 label 的不稳定率
print()
stat = defaultdict(lambda: [0, 0])
for (label, case), rp in multi.items():
    if 'real' not in case:
        pass
    stat[label][0] += 1
for label, case, Ps, EL, ET, rows in unstable:
    stat[label][1] += 1
print('按 label 的不稳定率（P 或 errorLevel 跨轮分歧）：')
for label, (tot, bad) in sorted(stat.items(), key=lambda kv: -kv[1][0]):
    if tot:
        print('   %-14s %2d/%2d 分歧  (%.0f%%)' % (label, bad, tot, 100.0 * bad / tot))
