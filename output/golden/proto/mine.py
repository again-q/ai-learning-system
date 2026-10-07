#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从真实判定结果里挖「难以发现的归因」的稳定形态。
数据源：output/golden/results/stability-raw/*.json（每题一次判定的完整产出）
只做统计与对齐，不改任何数据。
"""
import json, os, re, sys, glob
from collections import defaultdict, Counter

RAW = os.path.join(os.path.dirname(__file__), '..', 'results', 'stability-raw')

def load():
    rows = []
    for p in glob.glob(os.path.join(RAW, '*.json')):
        try:
            d = json.load(open(p, encoding='utf-8'))
        except Exception:
            continue
        if not isinstance(d, dict):
            continue
        d['_file'] = os.path.basename(p)
        rows.append(d)
    return rows

def norm_q(t):
    t = re.sub(r'\s+', '', str(t or ''))
    return t[:60]

def main():
    rows = load()
    print('文件数:', len(rows))
    by_q = defaultdict(list)
    for r in rows:
        by_q[norm_q(r.get('questionText'))].append(r)
    print('去重后题目数:', len(by_q))

    # 分档：有过程 / 无过程；判对 / 判错
    stat = Counter()
    for r in rows:
        stat['processAvailable=%s' % bool(r.get('processAvailable'))] += 1
        stat['errorLevel=%s' % (r.get('errorLevel') or 'null')] += 1
        stat['errorType=%s' % (r.get('errorType') or 'null')] += 1
        stat['有segments' if (r.get('segments') or []) else '无segments'] += 1
    for k, v in sorted(stat.items()):
        print('  ', k, v)

    # 以「题」为单位取最新一次判定（去重后每题取第一份，代表形态）
    uniq = {}
    for k, lst in by_q.items():
        uniq[k] = sorted(lst, key=lambda r: r['_file'])[0]
    print()
    print('=== 每题形态一览（去重后）===')
    print('%-3s %-8s %-4s %-6s %-6s %-5s %-4s %s' % ('#', 'type', 'P', 'errLvl', 'errType', 'segs', '断点', '知识点(P)'))
    idx = 0
    for k, r in uniq.items():
        idx += 1
        segs = r.get('segments') or []
        bp = r.get('breakpoint')
        ku = r.get('knowledgeUsage') or []
        kus = ' '.join('%s=%s' % (u.get('name', '?')[:10], u.get('P')) for u in ku[:5])
        print('%-3d %-8s %-4s %-6s %-6s %-5d %-4s %s' % (
            idx, r.get('questionType') or '?', r.get('P'),
            r.get('errorLevel') or '-', r.get('errorType') or '-',
            len(segs), (bp or {}).get('index', '-'), kus))

if __name__ == '__main__':
    main()
