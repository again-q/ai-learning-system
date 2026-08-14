# 📋 项目状态清单

> **用途一**：当你说「更新状态」时，按下方「更新操作清单」改对应文件。
> **用途二**：下方「当前快照」反映 main 分支最新结构（2026-08-14）。

完整文件分类见 [`doc/PROJECT-STRUCTURE.md`](PROJECT-STRUCTURE.md)。

---

## 当前快照（2026-08-14）

### 仓库布局

| 区域 | 路径 | 状态 |
|------|------|------|
| 小程序前端 | `miniprogram/` | ✅ 11 个活跃页面（已归档 knowledge-map / knowledge-tree） |
| 云函数 | `cloudfunctions/` | 8 个（graphService + knowledgeAdmin 为图谱核心） |
| 图谱源数据 | `data/knowledge-graph/` | 356 节点 JSON |
| 管线产物 | `data/pipeline/` | OCR/抽取中间文件 |
| 项目级文档 | `doc/project/` | ROADMAP、协作手册、门禁 |
| 文档 | `doc/` | 61 文件 |
| 归档 | `archive/` | 废弃页面 + v4 原型 + 旧 K 维度规格 |
| 知识库镜像 | `knowledge-base/` | 文档同步副本，非运行时 |

### 小程序页面状态

| 页面 | 路径 | 状态 |
|------|------|------|
| 知识图谱（Tab「图谱」） | `pages/graph/graph` | ✅ 新版：目录列表 + 演化链（2026-08-13 生产化） |
| 拍照诊断 | photo → report | ✅ 本地代码就绪，云端 diagnose 等待部署 |
| 五维雷达 | — | ❌ 已移除（2026-08-10 graph 改知识图谱），待重建 |
| 知识图谱副本 | archive/knowledge-map | 📦 已归档 |
| 旧知识树 | archive/knowledge-tree | 📦 已归档 |
| 维度详情 | dimension-detail | 🟡 占位，无入口 |

### 模块进度（摘要）

| 模块 | 状态 |
|------|------|
| 知识图谱数据 | ✅ 361 节点入库 |
| 知识图谱前端 | ✅ graph 页新版上线 |
| 五维能力可视化 | 🔴 雷达页缺失 |
| 拍照诊断闭环 | 🟡 前端有，云函数待部署 |
| 掌握度真实数据 | 🔴 仍 mock |

### 技术债

- `manageKnowledge` 与 `knowledgeAdmin` 双轨
- Code-Wiki 部分章节仍写 graph=五维雷达（以 PROJECT-STRUCTURE 为准）
- dimension-detail / model-cards / method-list 占位无入口

---

## 更新操作清单

### 一、时间信息

**涉及**：README、ROADMAP

| 字段 | 说明 |
|------|------|
| 距 9/1 剩余天数 | 同步更新 |
| 时间线 | ROADMAP 首段 |

### 二、进度概览

**涉及**：README、ROADMAP、本文「当前快照」

| 要更新 | 说明 |
|--------|------|
| 总进度百分比 | README |
| 模块状态表 | ROADMAP + 本文快照 |
| 页面/归档变动 | **必须同步** `doc/PROJECT-STRUCTURE.md` + `archive/README.md` |

### 三、待办完成

**涉及**：ROADMAP、ENGINEERING_TODO、Code-Wiki

### 四、更新日志

ROADMAP 末尾追加一行。

### 五、结构变更时额外步骤

```
1. 文件移入 archive/ → 更新 archive/README.md 清单
2. 从 app.json / 脚本移除引用
3. 更新 doc/PROJECT-STRUCTURE.md
4. 更新本文「当前快照」
5. ROADMAP 更新日志一行
```

### 六、执行顺序

```
1. 时间 → 2. 进度 → 3. 待办 → 4. 结构（如有）→ 5. 更新日志 → 6. git commit
```
