# AI 学习助手 · Code Wiki

> 项目名称：AI 学习助手（微信小程序）
> 文档版本：v1.2
> 生成日期：2026-07-29
> AppID：`wx256aa9c197b2e59e`
> 云环境：`cloud1-d8g0ty39wd73f430a`

---

## 📦 核心数据：知识图谱

**路径**：`knowledge-graph/`
**状态**：✅ 24/24节，359节点，已交付

```
knowledge-graph/
├── knowledge_index.json       ← 节点总索引
├── nodes/                     ← 24个独立JSON文件
│   ├── math_10_ch1_s1.json    ← 1.1 集合的概念 (11节点)
│   ├── ...
│   └── math_10_ch5_s7.json    ← 5.7 三角函数的应用 (12节点)
└── README.md
```

**知识节点 JSON 结构**：
```json
{
  "knowledge_id": "math_10_ch1_s1_001",
  "basic": { "name": "集合的概念", "type": "definition", ... },
  "tree": { "parent_id": "...", "path": ["数学","必修第一册","..."] },
  "concept": { "source_text": "教材原文" },
  "relations": { "reference": ["..."], "related": ["..."] },
  "importance": { "curriculum_weight": 3, "exam_frequency": 3 }
}
```

---

## 🏗️ 项目架构

```
miniprogram/           ← 微信小程序（原生）
├── pages/             ← 页面
│   ├── index/         ← 首页
│   ├── radar/         ← 五维雷达图
│   ├── chat/          ← AI 对话
│   └── knowledge/     ← 知识树
├── components/        ← 公共组件
├── utils/             ← 工具函数
└── app.js             ← 全局入口

cloudfunctions/        ← 云函数
├── login/             ← 微信登录
└── ...                ← (后续模块)

knowledge-graph/       ← 知识图谱（核心数据资产）
```

---

## 📝 编码规范

见 `knowledge-base/项目独有/coding-rules.md`

---

## 🔐 关键配置

| 配置项 | 值 | 位置 |
|--------|-----|------|
| AppID | `wx256aa9c197b2e59e` | `project.config.json` |
| 云环境 | `cloud1-d8g0ty39wd73f430a` | `app.js` |
| 基础库 | 3.16.2 | `app.json` |

---

## 📋 相关文档索引

| 文档 | 位置 |
|------|------|
| 决策记录 | `doc/decision-log.md` |
| 知识图谱方法论 | `doc/methodology-knowledge-graph.md` |
| 知识图谱复盘 | `doc/postmortem-知识图谱构建复盘.md` |
| JSON 规范 | `doc/知识图谱结构规范.md` |
| 开发路线图 | `ROADMAP.md` |
| 编码门禁 | `knowledge-base/项目独有/GATE_SUMMARY.md` |
| 五维理论 | `knowledge-base/项目独有/五维能力向量框架-理论文档.md` |
| 结构自查 | `knowledge-base/项目独有/REVIEW_STRUCTURE.md` |
