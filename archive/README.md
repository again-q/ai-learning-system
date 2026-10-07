# 归档目录（archive/）

> **不参与编译、不参与运行时引用。** 仅供历史查阅或必要时恢复。
> 当前生效的结构与入口见根目录 [`doc/PROJECT-STRUCTURE.md`](../doc/PROJECT-STRUCTURE.md)。

---

## 归档清单

| 路径 | 原位置 | 归档日期 | 原因 | 替代方案 |
|------|--------|----------|------|----------|
| `miniprogram/pages/knowledge-map/` | `miniprogram/pages/knowledge-map/` | 2026-08-14 | 与 tab 页 `pages/graph` 功能重复（99% 相同代码），无独立入口 | **`miniprogram/pages/graph/graph`**（tabBar「图谱」） |
| `miniprogram/pages/knowledge-tree/` | `miniprogram/pages/knowledge-tree/` | 2026-08-14 | 旧版知识树，读 `manageKnowledge` 旧数据，无任何页面跳转入口 | **`pages/graph/graph`** + `graphService.getAll` |
| `output/knowledge-graph-prototype-v4.html` | `output/knowledge-graph-prototype.html` | 2026-08-14 | v4 交互原型，已被 v5 取代 | **`doc/review/知识图谱前端重设计-原型v5.html`** |
| `doc/K-dimension-final.md` | `doc/archive/` ← 原 `specs/` | 已有 | K 维度规格 v1，已并入五维框架理论文档 | **`doc/theory/五维能力向量框架-理论文档.md`** |
| `doc/K-dimension-final-v2.md` | 同上 | 已有 | K 维度规格 v2，同上 | 同上 |
| `knowledge-graph/knowledge_index.json` | `knowledge-graph/` | **2026-10-02** | 过期节点总索引：`node_ids` 列表有 15 处 `math_10_ch2_s2__001` 双下划线错误、1.5 节缺 2 个节点；且它声明 `total_nodes=359`（治理前），与线上真源 271 不符。两个导入脚本（`import-knowledge-graph.js:17`、`manage-knowledge-nodes.py:22`）本就显式排除它，归档不影响运行 | **以线上 `knowledge_nodes`（271）为真源**；导入一律读 `knowledge-graph/nodes/*.json` |
| `scripts/render-sample-report-html{,2..12}.mjs` | `scripts/` | **2026-10-02** | 13 份同名的报告样例渲染脚本迭代副本（20:10→22:38 逐次改），全仓库**无人引用** | **`scripts/render-sample-report-html13.mjs`**（最终版，保留在 `scripts/`） |

> 本轮同时删除两个**空目录**：`specs/`、`1b07535069291a02388adadfee4cf3e1/`（均为空，无内容可恢复）。
> `.verify/`（82M 本地验证产物）已加入 `.gitignore`，**未删除**。

---

## 恢复指引

若需恢复某个归档页面到小程序：

1. 复制回 `miniprogram/pages/<name>/`
2. 在 `miniprogram/app.json` 的 `pages` 数组重新注册路径
3. 确认有页面 `navigateTo` / `switchTab` 指向该路径
4. 从本目录删除或更新本 README 对应行

---

## 归档原则

- 只移不删，保留 git 历史
- 移入 archive 后必须从 `app.json`、脚本、活跃文档中移除引用
- 历史评审包（`doc/review/`）**不归档**——它们记录当时决策上下文，即使路径已变
