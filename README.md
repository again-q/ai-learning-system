# AI 薄弱点诊断工具 — 微信小程序

> **课后辅助工具，不代替学校。**
>
> 基于认知科学的初高中学科薄弱点精确诊断系统（微信小程序 + CloudBase 云开发）。

| 项目 | 值 |
|------|-----|
| AppID | `wx256aa9c197b2e59e` |
| 云环境 | `cloud1-d8g0ty39wd73f430a` |
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

---

## 当前进度（2026-08-14）

| 模块 | 状态 | 说明 |
|------|------|------|
| 知识图谱数据 | ✅ | 361 节点入库 `knowledge_nodes` |
| 知识图谱前端 | ✅ | Tab「图谱」= `pages/graph`（目录 + 演化链） |
| 拍照诊断 | 🟡 | 前端 photo/report 就绪，云函数待部署 |
| 五维雷达可视化 | 🔴 | 原 graph 页已改知识图谱，雷达待重建 |
| 掌握度真实数据 | 🔴 | 前端 mock，待诊断链路写入 |

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
