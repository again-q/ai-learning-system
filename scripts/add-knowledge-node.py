#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
交互式新增知识图谱节点脚本（本地工具）

用途：
  在 knowledge-graph/nodes/*.json 中新增一个知识点节点，自动完成：
    - 章/节选择（人教A版 必修第一册，与 manage-knowledge-nodes.py 同一映射）
    - knowledge_id 自动编号（math_10_chX_sY_ZZZ，取该节文件最大序号 +1）
    - path 自动拼接（[数学, 必修第一册, 第X章…, X.Y …]）
    - 父节点/前置依赖/相关节点从已有节点中选择
    - 追加写入对应节文件（保持数组格式），并校验
    - 输出 knowledgeAdmin importNodes 格式的待导入 JSON

用法:
  python3 scripts/add-knowledge-node.py            # 交互式创建
  python3 scripts/add-knowledge-node.py --dry-run  # 只打印结果，不写文件

导入:
  脚本只负责生成本地 JSON 文件；写入云数据库（knowledge_nodes 集合）两种方式：
  1) 在 Reasonix 会话里让我用 CloudBase MCP 导入
  2) 管理端调用 knowledgeAdmin 云函数 action=importNodes，nodes 参数用 --export 输出
  python3 scripts/add-knowledge-node.py --export 待导入.json   # 导出最近一次/全部新节点

依赖: 仅标准库
"""

import json
import os
import re
import sys

NODES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'knowledge-graph', 'nodes')

# 与 manage-knowledge-nodes.py 保持一致的章节映射（人教A版 必修第一册）
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

TYPES = {
    'definition': '概念',
    'property': '性质',
    'method': '方法',
    'notation': '记号',
    'example': '例子',
    'reading': '阅读',
}

IMPORT_KEYS = ('knowledgeId', 'name', 'type', 'subject', 'stage', 'grade',
               'level', 'parentId', 'path', 'concept', 'importance', 'relations')


def section_file(ch, sec):
    return os.path.join(NODES_DIR, 'math_10_ch%d_s%d.json' % (ch, sec))


def load_section(ch, sec):
    """读取某节文件，返回 (节点列表, 是否数组格式)。文件不存在返回 ([], True)。"""
    path = section_file(ch, sec)
    if not os.path.exists(path):
        return [], True
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    if isinstance(data, list):
        return data, True
    if isinstance(data, dict) and 'nodes' in data:
        return data['nodes'], False
    return [], True


def save_section(ch, sec, nodes, is_array):
    path = section_file(ch, sec)
    data = nodes if is_array else {'nodes': nodes}
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print('  ✔ 已写入 %s （共 %d 个节点）' % (os.path.relpath(path, os.getcwd()), len(nodes)))


def next_seq(ch, sec):
    """该节文件内最大序号 +1；无文件时从 001 开始。"""
    nodes, _ = load_section(ch, sec)
    prefix = 'math_10_ch%d_s%d_' % (ch, sec)
    max_n = 0
    for n in nodes:
        kid = n.get('knowledge_id') or n.get('knowledgeId') or ''
        m = re.match(re.escape(prefix) + r'(\d+)$', kid)
        if m:
            max_n = max(max_n, int(m.group(1)))
    return max_n + 1


def ask(question, default=None, choices=None):
    """交互输入；choices 非空时列出选项，输入序号或原值。"""
    while True:
        hint = '（回车=%s）' % default if default is not None else ''
        print(question, hint)
        if choices:
            for i, c in enumerate(choices):
                print('  [%d] %s' % (i + 1, c))
        raw = input('> ').strip()
        if not raw and default is not None:
            return default
        if choices:
            if raw.isdigit() and 1 <= int(raw) <= len(choices):
                return choices[int(raw) - 1]
            if raw in choices:
                return raw
            print('  !! 请输入选项序号或以下值之一：%s' % ' / '.join(choices))
            continue
        return raw


def pick_node_ids(label, all_nodes, allow_none=True):
    """从已有节点中选择 knowledge_id（逗号分隔多个）。"""
    print('-- %s（输入序号，多个用逗号分隔；留空%s）--' % (label, '=无' if allow_none else '=全部'))
    for i, n in enumerate(all_nodes[:200]):
        name = (n.get('basic') or {}).get('name') or n.get('name') or '?'
        print('  [%d] %s  (%s)' % (i + 1, name, n.get('knowledge_id')))
    if len(all_nodes) > 200:
        print('  ...（共 %d 个，仅展示前 200，可用 knowledge_id 直接输入）' % len(all_nodes))
    while True:
        raw = input('> ').strip()
        if not raw:
            return [] if allow_none else None
        ids = []
        for part in raw.split(','):
            part = part.strip()
            if not part:
                continue
            if part.isdigit() and 1 <= int(part) <= len(all_nodes):
                ids.append(all_nodes[int(part) - 1].get('knowledge_id'))
            else:
                hit = [n for n in all_nodes if n.get('knowledge_id') == part]
                if hit:
                    ids.append(part)
                else:
                    print('  !! 未找到节点: %s' % part)
        if ids:
            return ids
        print('  !! 没有有效的选择，请重试')


def load_all_nodes():
    """读取 knowledge-graph/nodes/ 下所有节点。"""
    nodes = []
    if not os.path.isdir(NODES_DIR):
        return nodes
    for fn in sorted(os.listdir(NODES_DIR)):
        if not fn.endswith('.json') or fn == 'knowledge_index.json':
            continue
        try:
            with open(os.path.join(NODES_DIR, fn), 'r', encoding='utf-8') as f:
                data = json.load(f)
            lst = data if isinstance(data, list) else data.get('nodes', [])
            nodes.extend(lst)
        except (json.JSONDecodeError, OSError) as e:
            print('  !! 跳过 %s: %s' % (fn, e))
    return nodes


def main():
    dry_run = '--dry-run' in sys.argv
    if dry_run:
        print('== 试运行模式：不写文件 ==')

    # 1. 章 / 节
    print('== 新增知识点 ==')
    ch_label = ask('选择章：', default=1, choices=[CHAPTERS[i] for i in sorted(CHAPTERS)])
    ch = ch_label if isinstance(ch_label, int) else [k for k, v in CHAPTERS.items() if v == ch_label][0]
    sec_names = SECTIONS[ch]
    sec_label = ask('选择节：', choices=[sec_names[i] for i in sorted(sec_names)])
    sec = [k for k, v in sec_names.items() if v == sec_label][0]

    # 2. 名称 / 类型
    name = ask('知识点名称（教材术语，必填）')
    if not name:
        print('!! 名称不能为空'); sys.exit(1)
    type_label = ask('类型：', default='概念', choices=[TYPES[k] for k in TYPES])
    ntype = [k for k, v in TYPES.items() if v == type_label][0]

    # 3. 已有节点（用于父节点/前置/相关选择）
    all_nodes = load_all_nodes()
    this_sec_nodes, _ = load_section(ch, sec)
    pool = this_sec_nodes or all_nodes

    # 4. 父节点（根节点留空）
    parent_id = None
    if this_sec_nodes:
        print('-- 父节点（本节的根知识点可留空；也可输入其他节的 knowledge_id）--')
        for i, n in enumerate(this_sec_nodes):
            kid = n.get('knowledge_id')
            pn = n.get('parent_id') or n.get('parentId')
            if pn is None:
                nm = (n.get('basic') or {}).get('name') or n.get('name') or '?'
                print('  [%d] %s  (%s)  ← 根节点' % (i + 1, nm, kid))
        raw = input('> ').strip()
        if raw:
            if raw.isdigit() and 1 <= int(raw) <= len(this_sec_nodes):
                parent_id = this_sec_nodes[int(raw) - 1].get('knowledge_id')
            else:
                parent_id = raw
    else:
        parent_id = ask('父节点 knowledge_id（留空=根节点）', default='')

    # 5. 教材原文
    source_text = ask('教材原文（concept.source_text，可留空）', default='')

    # 6. 前置依赖 / 相关节点
    refs = pick_node_ids('前置依赖（relations.reference，演化链上游）', all_nodes, allow_none=True)
    rels = pick_node_ids('相关节点（relations.related）', all_nodes, allow_none=True)

    # 7. 重要度
    cw = int(ask('课标权重 curriculum_weight（1-5）', default=3))
    ef = int(ask('考察频率 exam_frequency（1-5）', default=3))

    # 8. 组装节点
    seq = next_seq(ch, sec)
    kid = 'math_10_ch%d_s%d_%03d' % (ch, sec, seq)
    path = ['数学', '必修第一册', CHAPTERS[ch], sec_label]
    node = {
        'knowledge_id': kid,
        'basic': {
            'name': name,
            'type': ntype,
            'subject': '数学',
            'stage': '高中',
            'grade': '必修第一册',
            'level': 'knowledge',
        },
        'tree': {
            'parent_id': parent_id,
            'path': path,
        },
        'concept': {
            'source_text': source_text,
            'level': 'knowledge',
        },
        'relations': {
            'reference': refs,
            'related': rels,
        },
        'importance': {
            'curriculum_weight': max(1, min(5, cw)),
            'exam_frequency': max(1, min(5, ef)),
        },
    }

    print('\n== 新节点 ==')
    print(json.dumps(node, ensure_ascii=False, indent=2))

    # 9. 写入
    if not dry_run:
        nodes, is_array = load_section(ch, sec)
        nodes.append(node)
        save_section(ch, sec, nodes, is_array)

    # 10. 导出待导入 JSON（knowledgeAdmin importNodes 格式）
    import_node = {k: node.get(k) for k in IMPORT_KEYS}
    import_node['knowledgeId'] = kid
    import_node['name'] = name
    import_node['type'] = ntype
    import_node['subject'] = '数学'
    import_node['stage'] = '高中'
    import_node['grade'] = '必修第一册'
    import_node['level'] = 'knowledge'
    import_node['parentId'] = parent_id
    import_node['path'] = path
    import_node['concept'] = {'source_text': source_text, 'level': 'knowledge'}
    import_node['importance'] = {'curriculum_weight': cw, 'exam_frequency': ef}
    import_node['relations'] = {'reference': refs, 'related': rels}
    import_node.pop('knowledge_id', None)

    export = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'output', 'kg_new_nodes.json')
    out_dir = os.path.dirname(export)
    if not os.path.isdir(out_dir):
        os.makedirs(out_dir)
    batch = []
    if os.path.exists(export):
        try:
            with open(export, 'r', encoding='utf-8') as f:
                old = json.load(f)
            batch = old if isinstance(old, list) else [old]
        except (json.JSONDecodeError, OSError):
            batch = []
    batch.append(import_node)
    with open(export, 'w', encoding='utf-8') as f:
        json.dump(batch, f, ensure_ascii=False, indent=1)

    print('\n✔ 完成：%s' % kid)
    print('  导入清单已累积到 output/kg_new_nodes.json（共 %d 条，可批量导入）' % len(batch))
    print('  下一步：在 Reasonix 里说「导入新知识点」，我会用 CloudBase 写入 knowledge_nodes 集合；')
    print('  或管理端调用 knowledgeAdmin importNodes，nodes 传该清单。')


if __name__ == '__main__':
    main()
