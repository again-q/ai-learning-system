#!/usr/bin/env python3
"""
知识图谱 Schema 统一脚本
========================
将 knowledge-graph/nodes/ 下 24 个 JSON 文件统一为标准格式。

标准格式：
{
  "knowledge_id": "...",
  "basic":     { "name": "...", "type": "definition|property|notation|method|example",
                 "subject": "数学", "stage": "高中", "grade": "必修第一册",
                 "level": "knowledge" },
  "tree":      { "parent_id": null, "path": [...] },        ← 无 children_ids
  "concept":   { "source_text": "...", "level": "knowledge" },
  "relations": { "reference": [...], "related": [...] },
  "importance": {}                                          ← 空，交由 Agent 2 评估
}

用法: python3 scripts/convert-kg-schema.py
"""

import json
import os
import re

NODES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "knowledge-graph", "nodes")

BASIC_SUBJECT = "数学"
BASIC_STAGE = "高中"
BASIC_GRADE = "必修第一册"
DEFAULT_LEVEL = "knowledge"

TYPE_VALUES = {"definition", "property", "notation", "method", "example"}


def normalize_type(raw):
    """将各种 type 值归一化为 5 种标准值"""
    t = str(raw).strip().lower() if raw else ""
    if t in TYPE_VALUES:
        return t
    # 常见非标准值映射
    mapping = {
        "concept": "definition",
        "theorem": "property",
        "meta": "definition",
        "overview": "definition",
        "application": "method",
        "skill": "method",
        "model": "definition",
        "explore": "example",
        "history": "definition",
        "connection": "property",
        "extension": "property",
        "proposition": "property",
        "thought": "definition",
        "background": "definition",
        "meta_concept": "definition",
    }
    return mapping.get(t, "definition")


def get_str(d, *keys, default=""):
    """安全获取嵌套字典的字符串值"""
    for k in keys:
        if isinstance(d, dict):
            d = d.get(k, {})
        else:
            return default
    return str(d) if d else default


def build_standard_node(src):
    """将任意格式的单个节点转为标准格式"""
    # --- 1. knowledge_id ---
    kid = src.get("knowledge_id") or src.get("id") or src.get("node_id") or ""

    # --- 2. basic ---
    if "basic" in src and isinstance(src["basic"], dict):
        # 旧格式: basic 嵌套
        b = src["basic"]
        name = b.get("name", "")
        typ = normalize_type(b.get("type", ""))
        subject = b.get("subject", BASIC_SUBJECT)
        stage = b.get("stage", BASIC_STAGE)
        grade = b.get("grade", BASIC_GRADE)
        level = b.get("level", DEFAULT_LEVEL)
    else:
        # 新格式: 顶层字段
        name = src.get("title", src.get("name", ""))
        typ = normalize_type(src.get("type", ""))
        subject = BASIC_SUBJECT
        stage = BASIC_STAGE
        grade = BASIC_GRADE
        level = DEFAULT_LEVEL

    basic = {
        "name": name,
        "type": typ,
        "subject": subject,
        "stage": stage,
        "grade": grade,
        "level": level,
    }

    # --- 3. tree ---
    tree = {"parent_id": None, "path": []}
    if "tree" in src and isinstance(src["tree"], dict):
        t = src["tree"]
        tree["parent_id"] = t.get("parent_id", None)
        tree["path"] = t.get("path", [])
    elif "path" in src:
        tree["path"] = src.get("path", [])

    # --- 4. concept ---
    source_text = ""
    if "concept" in src and isinstance(src["concept"], dict):
        source_text = src["concept"].get("source_text", "")
    elif "description" in src:
        source_text = src["description"]
    elif "content" in src:
        source_text = src["content"]

    concept = {"source_text": source_text, "level": DEFAULT_LEVEL}

    # --- 5. relations ---
    reference = []
    related = []
    if "relations" in src and isinstance(src["relations"], dict):
        r = src["relations"]
        reference = r.get("reference", [])
        related = r.get("related", [])
    else:
        reference = src.get("references", src.get("prerequisites", []))
        related = src.get("related_nodes", src.get("related", []))

    if isinstance(reference, str):
        reference = [reference]
    if isinstance(related, str):
        related = [related]

    relations = {"reference": reference, "related": related}

    # --- 6. importance ---
    importance = {}
    if "importance" in src and isinstance(src["importance"], dict):
        imp = src["importance"]
        cw = imp.get("curriculum_weight")
        ef = imp.get("exam_frequency")
        if cw is not None:
            importance["curriculum_weight"] = cw
        if ef is not None:
            importance["exam_frequency"] = ef
    elif "difficulty" in src:
        # ch4_s2 的 difficulty 字段，暂不映射到 importance
        pass

    return {
        "knowledge_id": kid,
        "basic": basic,
        "tree": tree,
        "concept": concept,
        "relations": relations,
        "importance": importance,
    }


def extract_nodes(data):
    """从各种外层包装中提取节点列表"""
    if isinstance(data, list):
        return data
    if not isinstance(data, dict):
        return []

    # 各种包装格式
    for key in ("nodes", "knowledge_nodes"):
        if key in data and isinstance(data[key], list):
            return data[key]

    # { section: { ... }, nodes: [...] }
    if "section" in data and isinstance(data["section"], dict):
        section = data["section"]
        if "nodes" in data and isinstance(data["nodes"], list):
            return data["nodes"]

    # { meta: {...}, nodes: [...] }
    if "meta" in data and "nodes" in data:
        return data["nodes"]

    return []


def process_file(filepath):
    """处理单个 JSON 文件，返回转换后的节点列表"""
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    nodes = extract_nodes(data)
    if not nodes:
        print(f"  ⚠️  未找到节点: {os.path.basename(filepath)}")
        return None

    converted = [build_standard_node(n) for n in nodes]

    # 按 knowledge_id 去重
    seen = set()
    unique = []
    for n in converted:
        kid = n["knowledge_id"]
        if kid in seen:
            print(f"  ⚠️  重复节点跳过: {kid}")
            continue
        seen.add(kid)
        unique.append(n)

    return unique


def main():
    print("=" * 60)
    print("知识图谱 Schema 统一转换")
    print("=" * 60)

    json_files = sorted([
        f for f in os.listdir(NODES_DIR)
        if f.endswith(".json") and f != "knowledge_index.json"
    ])

    print(f"\n找到 {len(json_files)} 个节点文件\n")

    total_nodes_before = 0
    total_nodes_after = 0

    for fname in json_files:
        filepath = os.path.join(NODES_DIR, fname)
        result = process_file(filepath)
        if result is None:
            continue

        # 统计
        before = len(extract_nodes(json.load(open(filepath, "r", encoding="utf-8"))))
        total_nodes_before += before

        # 写回
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        after = len(result)
        total_nodes_after += after
        print(f"  ✅ {fname}: {before} → {after} 节点")

    # --- 重建 knowledge_index.json ---
    print(f"\n{'='*60}")
    print(f"重建 knowledge_index.json...")

    index = {"sections": [], "nodes": []}
    for fname in json_files:
        if fname == "knowledge_index.json":
            continue
        filepath = os.path.join(NODES_DIR, fname)
        with open(filepath, "r", encoding="utf-8") as f:
            nodes = json.load(f)
        for n in nodes:
            index["nodes"].append({
                "knowledge_id": n["knowledge_id"],
                "name": n["basic"]["name"],
                "type": n["basic"]["type"],
                "parent_id": n["tree"]["parent_id"],
                "path": n["tree"]["path"],
            })

    idx_path = os.path.join(NODES_DIR, "knowledge_index.json")
    with open(idx_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"转换完成！")
    print(f"  总文件: {len(json_files)}")
    print(f"  节点数: {total_nodes_before} → {total_nodes_after}")
    print(f"  索引: knowledge_index.json ({len(index['nodes'])} 节点)")
    print(f"\n⚠️ importance 字段已置空，需要 Agent 2 评估后写入")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
