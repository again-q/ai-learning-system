# AI 薄弱点诊断工具 — 微信小程序

> **课后辅助工具，不代替学校。**
>
> 基于认知科学的初高中学科薄弱点精确诊断系统（微信小程序 + CloudBase 云开发）。

| 项目 | 值 |
|------|-----|
| 基础库 | 3.16.2 |
| 技术栈 | 微信小程序原生 + CloudBase 云开发 |

---

## 快速入口

| 你想… | 去这里 |
|--------|--------|
| **看完整文件分类** | [`doc/PROJECT-STRUCTURE.md`](doc/PROJECT-STRUCTURE.md) |
| **更新项目状态** | [`doc/STATUS-MANIFEST.md`](doc/STATUS-MANIFEST.md) |
| **看路线图** | [`ROADMAP.md`](ROADMAP.md) |
| **改知识图谱前端** | `miniprogram/pages/graph/`（Tab「图谱」） |
| **改图谱数据** | `knowledge-graph/nodes/` → `scripts/manage-knowledge-nodes.py` |
| **AI 协作规则** | [`AI协作手册.md`](AI协作手册.md) |
| **查归档/废弃文件** | [`archive/README.md`](archive/README.md) |
| 🎯 **我们为谁、解决什么** | [`doc/TARGET.md`](doc/TARGET.md)（**目标唯一事实源**，决策 059） |

---

## 当前状态（2026-10-02）

**一句话**：**产品目标已重定** —— 从「找薄弱知识点」改为「**给高分段学生的解答题过程审阅**」（决策 059，见 [`doc/TARGET.md`](doc/TARGET.md)）。当前主要矛盾是**目标已重定、实现仍停在旧目标**：判定层无「松/绕」信号、报告只审错题、主轴仍是 K、主链路仍挂 `judgeOne`。次要矛盾＝判定稳定性（审计 P1/P2，已随 K 降级而降级）。

> 📊 **状态以 [`doc/STATUS.md`](doc/STATUS.md) 为准**（唯一入口：**23 项状态** + §0 主要矛盾 + 「改了什么要同步哪些」触发清单）
> 🎯 **目标以 [`doc/TARGET.md`](doc/TARGET.md) 为准**（决策 059，2026-10-02 重定）
> 🗺 路线图见 [`ROADMAP.md`](ROADMAP.md) ｜ 文件结构见 [`doc/PROJECT-STRUCTURE.md`](doc/PROJECT-STRUCTURE.md)

---

## 项目结构（精简）

```
ai-learning-system/
├── miniprogram/              ← 小程序（编译这个）
│   └── pages/graph/          ← Tab「图谱」= 知识图谱（唯一入口）
├── cloudfunctions/           ← 云函数
│   ├── graphService/         ← 图谱查询
│   └── knowledgeAdmin/       ← 节点管理
├── knowledge-graph/          ← 图谱 JSON 源文件
├── output/                   ← OCR 管线中间产物
├── doc/                      ← 全部设计文档
│   ├── PROJECT-STRUCTURE.md  ← 文件用途分类（详细）
│   └── STATUS-MANIFEST.md    ← 状态快照 + 更新清单
├── archive/                  ← 废弃页面/原型（不参与编译）
├── scripts/                  ← 门禁、导入、测试
└── ROADMAP.md
```

---

## 相关文档

| 文档 | 路径 |
|------|------|
| 文件结构详解 | `doc/PROJECT-STRUCTURE.md` |
| 开发路线图 | `ROADMAP.md` |
| 决策记录 | `doc/decision-log.md` |
| 知识图谱规范 | `doc/knowledge-graph/知识图谱结构规范.md` |
| 编码门禁 | `GATE_SUMMARY.md` |

---

*结构整理：2026-08-14 · 废弃页面见 `archive/`*
