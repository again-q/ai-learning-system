#!/usr/bin/env python3
"""
Intern-Decision-0.8B 本地实测：能否用于「知识点选择」

背景（今天实测）：
  · DeepSeek V4.1 自由写知识点名 → 稳定度 4%（措辞每次都变）
  · 只输出序号（prompt 约束）→ 稳定度 75%
  · Intern-Decision 走「读 logits 不生成」，理论上更稳、输出零成本

本脚本测三件事：
  ① M1 8GB 能否跑起来（内存/速度）
  ② choice 在真实知识点候选上的表现
  ③ 三轮一致性（对比 V4.1 的 4% / 序号版的 75%）

用法: .venv_decision/bin/python scripts/probe-intern-decision.py
"""
import json
import sys
import time
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / 'output/models/Intern-Decision-0.8B'
sys.path.insert(0, str(MODEL_DIR))

MAX_SYMBOLS = 62  # A-Z a-z 0-9

# 内置候选（今天实测最容易混的一组：并集/交集/集合/子集…）
CATALOG = [
    ('集合', '把一些元素组成的总体叫做集合'),
    ('元素', '集合中的每个对象'),
    ('属于与不属于', '元素与集合的关系，a∈A 或 a∉A'),
    ('属于与包含的关系', '元素与集合用∈，集合与集合用⊆'),
    ('并集', '由所有属于A或属于B的元素组成的集合'),
    ('交集', '由既属于A又属于B的元素组成的集合'),
    ('补集', '全集U中不属于A的元素组成的集合'),
    ('子集', 'A中任意元素都属于B，则A是B的子集'),
    ('集合相等', '两个集合的元素完全相同'),
    ('确定性', '集合中的元素必须是确定的'),
    ('互异性', '集合中的元素不能重复'),
    ('无序性', '集合中的元素没有顺序'),
]

TESTS = [
    {
        'name': '并集运算',
        'state': '已知集合 A={1,2,3}，B={2,3,4}，求 A∪B。',
        'expect': '并集',
    },
    {
        'name': '交集运算',
        'state': '已知集合 M={x|-1<x<2}，N={x|0<x<3}，求 M∩N。',
        'expect': '交集',
    },
    {
        'name': '互异性+属于',
        'state': '已知集合 A={a, |a|, a-2}，若 3∈A，求实数 a 的值。',
        'expect': '互异性',
    },
    {
        'name': '概念判断',
        'state': '判断：某班年龄较小的同学能形成一个集合。',
        'expect': '确定性',
    },
]


def main():
    print('=' * 80)
    print('  Intern-Decision-0.8B 本地实测（M1 / 8GB 统一内存）')
    print('=' * 80)

    if not MODEL_DIR.exists():
        print(f'模型目录不存在: {MODEL_DIR}')
        return 1

    import torch
    from inference import DecisionEngine  # 模型自带的推理引擎

    if len(CATALOG) > MAX_SYMBOLS:
        print(f'候选数 {len(CATALOG)} 超过符号上限 {MAX_SYMBOLS}')
        return 1

    # 设备：M1 用 mps
    device = 'mps' if torch.backends.mps.is_available() else 'cpu'
    print(f'\n设备: {device}   候选数: {len(CATALOG)}')
    print('加载模型（首次较慢）...')
    t0 = time.time()
    try:
        engine = DecisionEngine(checkpoint=str(MODEL_DIR), device=device, dtype='float32')
    except Exception as e:
        print(f'加载失败({device}): {type(e).__name__}: {e}')
        print('回退 CPU 重试...')
        engine = DecisionEngine(checkpoint=str(MODEL_DIR), device='cpu', dtype='float32')
        device = 'cpu'
    print(f'加载完成，用时 {time.time() - t0:.1f}s\n')

    # 构造 choice 的 criteria：选项名 → 描述
    criteria = {name: desc for name, desc in CATALOG}
    name_by_value = {name: name for name, _ in CATALOG}

    results = []
    for t in TESTS:
        print('-' * 80)
        print(f'  [{t["name"]}] {t["state"][:56]}')
        print(f'  期望: {t["expect"]}')
        picks = []
        for rnd in range(3):
            req = {
                'state': t['state'],
                'questions': {
                    'knowledge': {
                        'type': 'choice',
                        'instructions': '这道题实际考查哪个数学知识点？',
                        'criteria': criteria,
                    }
                },
            }
            t1 = time.time()
            try:
                out = engine.predict(req)
                ans = out['answers']['knowledge']
                pick = ans['choice']
                conf = ans.get('confidence')
                picks.append(pick)
                dt = (time.time() - t1) * 1000
                top = sorted(ans['probabilities'].items(), key=lambda kv: -kv[1])[:3]
                topstr = ' | '.join(f'{k}:{v:.2f}' for k, v in top)
                print(f'    轮{rnd+1}: {pick}  (conf {conf:.2f}, {dt:.0f}ms)   top3: {topstr}')
            except Exception as e:
                picks.append(f'ERR:{type(e).__name__}')
                print(f'    轮{rnd+1} 失败: {type(e).__name__}: {e}')
        ok = len(set(picks)) == 1 and picks and picks[0] == t['expect']
        stable = len(set(picks)) == 1
        print(f'    -> 三轮一致: {"是" if stable else "否"}   命中期望: {"是" if ok else "否"}')
        results.append({'name': t['name'], 'expect': t['expect'], 'picks': picks, 'stable': stable, 'ok': ok})

    # 汇总
    print('\n' + '=' * 80)
    print('  汇总')
    print('=' * 80)
    n = len(results)
    stab = sum(1 for r in results if r['stable'])
    hit = sum(1 for r in results if r['ok'])
    print(f'  三轮一致率: {stab}/{n} = {stab/n*100:.0f}%')
    print(f'  命中期望:   {hit}/{n} = {hit/n*100:.0f}%')
    print(f'\n  对照（今天 DeepSeek V4.1 实测）:')
    print(f'    自由写名字  稳定度 4%')
    print(f'    只输出序号  稳定度 75%')

    out_dir = ROOT / 'output/intern-decision'
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / 'result.json').write_text(json.dumps({
        'device': device, 'catalogSize': len(CATALOG), 'results': results,
    }, ensure_ascii=False, indent=1))
    print(f'\n  落盘: output/intern-decision/result.json')
    return 0


if __name__ == '__main__':
    sys.exit(main())
