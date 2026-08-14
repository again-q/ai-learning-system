# 数据目录

本目录集中存放**非运行时**的数据与管线产物，与 `miniprogram/`、`cloudfunctions/` 分离。

| 子目录 | 用途 | 谁读 |
|--------|------|------|
| `knowledge-graph/` | 知识图谱 JSON 源文件（入库前真源，356 节点） | 导入脚本 → CloudBase |
| `pipeline/` | OCR / Agent 抽取 / 质检中间产物 | 构建管线脚本，**前端不读** |

导入：`python3 scripts/manage-knowledge-nodes.py gen` · `node scripts/import-knowledge-graph.js`
