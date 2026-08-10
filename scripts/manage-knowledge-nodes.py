#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
知识图谱节点管理脚本（本地工具）
用途：
  1) 校验/修复 knowledge-graph/nodes/*.json 的数据（重点是补齐缺失的 path）
  2) 输出标准导入 JSON（供 knowledgeAdmin 云函数 action=import 批量 upsert）

用法:
  python3 scripts/manage-knowledge-nodes.py check          # 只检查，输出问题清单
  python3 scripts/manage-knowledge-nodes.py gen            # 修复并输出 /tmp/kg_import_fixed.json
  python3 scripts/manage-knowledge-nodes.py gen --out x.json

依赖: 仅标准库
"""
import json
import glob
import sys
import os

NODES_DIR = os.path.join(os.path.dirname(__file__), '..', 'knowledge-graph', 'nodes')
INDEX_EXCLUDE = 'knowledge_index.json'

# 人教A版 必修第一册 章/节 名称映射（按 knowledge_id 的 ch/s 段补 path）
CHAPTERS = {
    1: '第一章 集合与常用逻辑用语',
    2: '第二章 一元二次函数、方程和不等式',
    3: '第三章 函数的概念与性质',
    4: '第四章 指数函数与对数函数',
    5: '第五章 三角函数',
}
SECTIONS = {
    1: {1: '1.1 集合的概念', 2: '1.2 集合间的基本关系', 3: '1.3 集合的基本运算',
        4: '1.4 充分条件与必要条件', 5: '1.5 全称量词与存在量词'},
    2: {1: '2.1 等式性质与不等式性质', 2: '2.2 基本不等式',
        3: '2.3 二次函数与一元二次方程、不等式'},
    3: {1: '3.1 函数的概念及其表示', 2: '3.2 函数的基本性质', 3: '3.3 幂函数',
        4: '3.4 函数的应用（一）'},
    4: {1: '4.1 指数', 2: '4.2 指数函数', 3: '4.3 对数', 4: '4.4 对数函数',
        5: '4.5 函数的应用（二）'},
    5: {1: '5.1 任意角和弧度制', 2: '5.2 三角函数的概念', 3: '5.3 诱导公式',
        4: '5.4 三角函数的图象与性质', 5: '5.5 三角恒等变换',
        6: '5.6 函数 y=Asin(ωx+φ)', 7: '5.7 三角函数的应用'},
}


def parse_kid(kid):
    """math_10_ch1_s3_001 -> (ch=1, s=3)"""
    try:
        parts = kid.split('_')
        for p in parts:
            if p.startswith('ch'):
                ch = int(p[2:])
            elif p.startswith('s'):
                s = int(p[1:])
        return ch, s
    except Exception:
        return None, None


def build_path(kid):
    """按 knowledge_id 生成标准 4 级 path；未知章节返回 None"""
    ch, s = parse_kid(kid)
    if ch is None:
        return None
    ch_name = CHAPTERS.get(ch)
    if not ch_name:
        return None
    sec_name = (SECTIONS.get(ch) or {}).get(s)
    if not sec_name:
        return None
    return ['数学', '必修第一册', ch_name, sec_name]


def collect():
    """读取全部节点，补 path，输出导入格式"""
    nodes = []
    problems = []
    files = sorted(f for f in glob.glob(os.path.join(NODES_DIR, '*.json'))
                   if INDEX_EXCLUDE not in f)
    for f in files:
        data = json.load(open(f, encoding='utf-8'))
        lst = data if isinstance(data, list) else data.get('nodes', [])
        for n in lst:
            basic = n.get('basic') or {}
            tree = n.get('tree') or {}
            node = {
                'knowledgeId': n.get('knowledge_id') or n.get('knowledgeId'),
                'name': basic.get('name') or n.get('name') or '',
                'type': basic.get('type') or n.get('type') or 'definition',
                'subject': basic.get('subject') or '数学',
                'stage': basic.get('stage') or '',
                'grade': basic.get('grade') or '',
                'level': basic.get('level') or 1,
                'parentId': tree.get('parent_id') or n.get('parentId') or None,
                'path': tree.get('path') or n.get('path') or [],
                'concept': n.get('concept') or None,
                'importance': n.get('importance') or None,
                'relations': n.get('relations') or None,
            }
            if not node['path']:
                gen = build_path(node['knowledgeId'])
                if gen:
                    node['path'] = gen
                else:
                    problems.append(f"[未映射] {node['knowledgeId']} {node['name']}")
            nodes.append(node)

    # 去重检查
    ids = [n['knowledgeId'] for n in nodes]
    dup = [x for x in set(ids) if ids.count(x) > 1]
    if dup:
        problems.append(f'[重复] knowledgeId 重复: {dup}')

    return nodes, problems


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'gen'
    nodes, problems = collect()
    print(f'节点总数: {len(nodes)}')

    if cmd == 'check':
        print(f'path 仍为空: {sum(1 for n in nodes if not n["path"])} 个')
        for p in problems:
            print(' ', p)
        if not problems:
            print('✅ 无问题')
        return

    if cmd == 'gen':
        out = None
        for i, a in enumerate(sys.argv):
            if a == '--out' and i + 1 < len(sys.argv):
                out = sys.argv[i + 1]
        out = out or '/tmp/kg_import_fixed.json'
        json.dump(nodes, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
        print(f'已输出: {out}')
        for p in problems[:20]:
            print(' ', p)
        if len(problems) > 20:
            print(f'  …共 {len(problems)} 个问题')
        print(f'path 为空: {sum(1 for n in nodes if not n["path"])} 个')
        return

    print(f'未知命令: {cmd}（支持 check / gen）')


if __name__ == '__main__':
    main()
