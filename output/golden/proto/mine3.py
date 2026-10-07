#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""第三步验证：
  V1 跨题两极化是否站得住（同知识点 P 不一致时，难度是否可比）
  V2 同一道题多次判定是否一致（若判定本身不稳，「难以发现的归因」建在沙上）
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
    uniq.setdefault(nq(r.get('questionText')), r)

print('【V1】跨题两极化明细（同知识点，P=0 与 P=1 各自的题与难度）')
for target in ['独立性检验', '等差数列的前n项和']:
    print('  ──', target)
    for r in uniq.values():
        for u in (r.get('knowledgeUsage') or []):
            if str(u.get('name')) == target:
                print('     P=%s  D=%.2f  L=%s  %s' % (
                    u.get('P'), float(r.get('D') or 0), r.get('level'),
                    (r.get('questionText') or '')[:34].replace('\n', ' ')))

print('\n【V2】同一题多次判定的稳定性（按题聚合所有 run）')
by_q = defaultdict(list)
for r in rows:
    by_q[nq(r.get('questionText'))].append(r)
multi = {k: v for k, v in by_q.items() if len(v) > 1}
print('  被判定多次的题：%d 道（共 %d 条记录）' % (len(multi), sum(len(v) for v in multi.values())))

unstable = []
for k, v in multi.items():
    Ps = {round(float(x.get('P') or 0), 2) for x in v}
    EL = {x.get('errorLevel') for x in v}
    AT = {x.get('errorAttribution') for x in v}
    if len(Ps) > 1 or len(EL) > 1:
        unstable.append((k, v, Ps, EL, AT))

print('  其中 P 或 errorLevel 出现分歧：%d 道' % len(unstable))
for k, v, Ps, EL, AT in unstable[:12]:
    print('   · %s' % (k[:36] or '(题面为空)'))
    print('       P集合=%s  errorLevel集合=%s  次数=%d' % (sorted(Ps), sorted(str(e) for e in EL), len(v)))
    for x in v[:4]:
        print('         [%s] P=%s errLvl=%s errType=%s attr=%s' % (
            x['_file'][:24], x.get('P'), x.get('errorLevel'), x.get('errorType'),
            str(x.get('errorAttribution'))[:30]))
