# 项目文件结构说明（按用途分类）

> **单一事实来源**：本文描述 `main` 分支当前仓库布局。归档内容见 [`archive/README.md`](../archive/README.md)。
> 最后更新：2026-08-14

---

## 一、总览

```
ai-learning-system/                    ~404 文件 · ~10MB
├── miniprogram/          【运行】微信小程序前端
├── cloudfunctions/       【运行】CloudBase 云函数
├── knowledge-graph/      【数据】知识图谱 JSON 源文件（入库前真源）
├── output/               【管线】OCR/抽取中间产物（非前端直读）
├── scripts/              【工具】门禁、导入、测试脚本
├── doc/                  【文档】PRD / 架构 / 详设 / 规范 / 评审
├── archive/              【归档】已废弃页面与原型（不参与编译）
├── knowledge-base/       【镜像】文档同步副本（→ 外部知识库，非运行时）
├── .reasonix/            【协作】AI Skill 与 Hook 配置
└── （根目录）            项目入口 README、ROADMAP、gate.sh 等
```

---

## 二、小程序前端 `miniprogram/`（编译入口）

### 2.1 TabBar 页面（日常必用）

| Tab | 路径 | 用途 | 云函数依赖 |
|-----|------|------|-----------|
| 首页 | `pages/index/index` | 掌握度环、今日建议、拍照诊断入口 | — |
| 学习 | `pages/study/study` | AI 对话（mock） | — |
| **图谱** | **`pages/graph/graph`** | **知识图谱（目录 + 演化链）** | `graphService.getAll` |
| 我的 | `pages/mine/mine` | 个人中心 | `userLogin` |

### 2.2 非 Tab 页面（按功能）

| 路径 | 用途 | 入口 | 状态 |
|------|------|------|------|
| `pages/login/login` | 登录授权 | 未登录跳转 | ✅ 可用 |
| `pages/photo/photo` | 拍照上传诊断 | 首页 | ✅ P0 闭环 |
| `pages/report/report` | 诊断报告 | photo 完成后 | ✅ P0 闭环 |
| `pages/dimension-detail/dimension-detail` | K 维度三层（知识/模型/方法） | **暂无入口**（原五维雷达已移除） | 🟡 占位 |
| `pages/model-cards/model-cards` | 模型卡片 | dimension-detail | 🟡 占位 |
| `pages/method-list/method-list` | 方法列表 | dimension-detail | 🟡 占位 |
| `pages/admin/knowledge-admin/knowledge-admin` | 节点管理后台 | 我的页 | ✅ 可用 |

### 2.3 已归档（不在 `app.json`）

| 原路径 | 现位置 | 原因 |
|--------|--------|------|
| `pages/knowledge-map/` | `archive/miniprogram/pages/knowledge-map/` | 与 graph 重复 |
| `pages/knowledge-tree/` | `archive/miniprogram/pages/knowledge-tree/` | 旧树 + 旧云函数 |

### 2.4 其他

| 路径 | 用途 |
|------|------|
| `app.js` / `app.json` / `app.wxss` | 全局配置、TabBar、页面注册 |
| `components/cloudTipModal/` | 云开发提示组件 |
| `images/` | Tab 图标、UI 资源（含云开发模板遗留图） |

---

## 三、云函数 `cloudfunctions/`

| 云函数 | 用途 | 前端调用方 | 状态 |
|--------|------|-----------|------|
| `graphService` | 知识图谱查询（getAll/getGraph/getReport） | **graph** | ✅ 核心 |
| `knowledgeAdmin` | 节点导入/增删改/stats | knowledge-admin | ✅ 核心 |
| `manageKnowledge` | **旧版**知识 CRUD | knowledge-admin、model-cards、method-list | 🟡 双轨遗留 |
| `userLogin` | 用户登录 | login、mine | ✅ |
| `photoUpload` | 照片上传 | photo | ✅ P0 |
| `diagnose` | 诊断管线 | photo → report | 🟡 本地有、云端待部署 |
| `judgeOne` | 单题判定 | diagnose 内部 | 🟡 同上 |
| `dispute` | 异议重诊 | report | 🟡 同上 |

部署脚本：`uploadCloudFunction.sh`

---

## 四、知识图谱数据（两层，勿混）

| 位置 | 内容 | 谁用 |
|------|------|------|
| **`knowledge-graph/nodes/*.json`** | 24 节标准 JSON，356 节点 | 导入脚本 → CloudBase |
| **`output/`** | OCR layout / agent2 抽取 / agent3 质检 / sections 文本 | 构建管线，**前端不读** |
| **CloudBase `knowledge_nodes`** | 361 条已入库 | `graphService.getAll` |

导入工具：`scripts/manage-knowledge-nodes.py`、`scripts/import-knowledge-graph.js`

---

## 五、文档 `doc/`（61 文件）

| 子目录 | 用途 |
|--------|------|
| `prd/` | 产品需求（拍照录入 MVP） |
| `arch/` | 小程序/后端 SAD |
| `architecture/` | 诊断引擎、五维评分、系统架构 |
| `detailed/` | 云函数与各页面详设 |
| `theory/` | 五维能力框架理论（**现行 K 维度规格**） |
| `standards/` | 设计语言、前端经验、开发经验 |
| `review/` | 评审包、**知识图谱原型 v5** |
| `reference/` | Code-Wiki（代码百科，部分章节待更新） |
| `knowledge-graph/` | 图谱构建方法论与规范 |
| `data/` | 需求确认、数据来源清单 |
| `prompts/` | Agent 抽取 prompt |
| `external-references/` | 外部参考书籍摘录 |
| `decision-log.md` | 决策记录 |
| `ENGINEERING_TODO.md` | 工程待办 |
| **`PROJECT-STRUCTURE.md`** | **本文** |
| **`STATUS-MANIFEST.md`** | 状态更新操作清单 + 当前快照 |

> 旧版 K 维度规格已移至 [`archive/doc/`](../archive/doc/)。

---

## 六、脚本与协作 `scripts/` + `.reasonix/`

| 文件 | 用途 |
|------|------|
| `gate.sh`（根目录 symlink） | 五阶段门禁 CLI |
| `scripts/gate-hook.sh` | PreToolUse 编辑拦截 |
| `scripts/manage-knowledge-nodes.py` | 图谱 path 修复 + 导入 JSON |
| `scripts/import-knowledge-graph.js` | 批量导入 CloudBase |
| `scripts/pipeline-all.sh` | OCR 全管线 |
| `.reasonix/skills/` | prd-writer、gatekeeper、code-reviewer 等 |

---

## 七、镜像目录 `knowledge-base/`

由 `sync-config.json` 定义，将根目录文档同步到外部知识库平台。**不是运行时依赖**，改 doc 后按需 sync。

---

## 八、已知结构债（待后续清理）

1. **五维雷达页已消失**：原 `pages/graph` 为 K/A/T/Q/S 雷达，2026-08-10 改为知识图谱；五维可视化暂无页面
2. **`manageKnowledge` 双轨**：旧 CRUD 与 `knowledgeAdmin` / `graphService` 并存
3. **`dimension-detail` 孤儿**：注册但无 inbound 导航
4. **Code-Wiki 部分过时**：仍写 graph=五维雷达，应以本文 + ROADMAP 为准

---

## 九、改文件前速查

| 我要改… | 先查… |
|---------|-------|
| 知识图谱 UI | `miniprogram/pages/graph/` + `app.json` tabBar |
| 图谱数据 | `knowledge-graph/nodes/` → 导入 → `graphService` |
| 拍照诊断 | `pages/photo` + `pages/report` + `diagnose` 云函数 |
| 设计规范 | `doc/standards/设计语言规范.md` |
| 小程序坑 | `doc/standards/前端视觉与动画工程经验.md` |
| AI 协作流程 | `AI协作手册.md` |
