# AI 学习助手 — 微信小程序

> 面向 K12 学生的 AI 个性化学习助手，基于「五维能力向量模型」量化学科掌握程度，提供个性化学习建议。

| 项目 | 值 |
|------|-----|
| AppID | `wx256aa9c197b2e59e` |
| 云环境 | `cloud1-d8g0ty39wd73f430a` |
| 基础库 | 3.16.2 |
| 技术栈 | 微信小程序原生 + CloudBase 云开发 |

---

## 功能概览

| 页面 | 功能 |
|------|------|
| 🏠 **首页** | 学科切换、掌握度环形图、今日学习建议 |
| 💬 **学习** | AI 对话式学习界面（待接入真实模型） |
| 🕸 **图谱** | Canvas 五维能力雷达图，支持点击缩放 |
| 👤 **我的** | 学习统计、个人中心 |
| 🔑 **登录** | 微信头像昵称登录 |
| 🌳 **知识树** | 知识点树形展示 |
| ⚙️ **知识管理后台** | 知识点 CRUD 管理 |

---

## 快速开始

### 环境准备

1. **微信开发者工具**（最新稳定版）
2. **开通云开发**：在工具中创建云环境
3. 确认 `miniprogram/app.js` 中 `globalData.env` 指向你的云环境 ID

### 本地运行

```bash
# 1. 用微信开发者工具打开本目录

# 2. 部署云函数
右键 cloudfunctions/userLogin → 「上传并部署：云端安装依赖」
右键 cloudfunctions/manageKnowledge → 「上传并部署：云端安装依赖」
右键 cloudfunctions/quickstartFunctions → 「上传并部署：云端安装依赖」

# 3. 创建数据库集合
云开发控制台 → 数据库 → 创建集合：users、knowledge_nodes、node_progress

# 4. 点击「编译」预览
```

### 批量上传脚本

```bash
# 上传所有云函数（需在 CI 或终端中执行）
bash uploadCloudFunction.sh
```

---

## 编码门禁系统

项目使用 **五阶段门禁流程** 保证代码质量，所有功能开发必须依次通过：

```
PRD → 架构 → 详细设计 → 编码 → 代码评审
```

### 一键全流程

```bash
# 在一个模块上自动走完五阶段（推荐）
run_skill({ name: "conductor", arguments: "module=<模块名> task=<任务描述>" })
```

### 门禁 CLI

```bash
bash scripts/gate.sh status        # 查看全阶段状态
bash scripts/gate.sh check <阶段>  # 检查能否进入某阶段
bash scripts/gate.sh pass <阶段>   # 标记阶段完成
```

### 组件清单

| 组件 | 位置 | 作用 |
|------|------|------|
| `gate.sh` | `scripts/gate.sh` | 统一门禁 CLI |
| `gate-hook.sh` | `scripts/gate-hook.sh` | PreToolUse Hook，编辑代码前拦截 |
| `.reasonix/settings.json` | 根目录 | Hook 配置 |
| `CLAUDE.md` | 根目录 | AI 行为规则 |
| `coding-rules.md` | 根目录 | 各阶段详细流程 |

7 个 Skill 位于 `.reasonix/skills/`：`conductor`、`prd-writer`、`system-architect`、`task-decomposer`、`gatekeeper`、`code-reviewer`、`review-expert`

---

## 核心理论：五维能力向量模型

```
M = (K, A, T, Q, S)
```

| 维度 | 名称 | 颜色 |
|------|------|------|
| K | 知识掌握 (Knowledge Mastery) | `#007aff` |
| A | 能力水平 (Ability Level) | `#34c759` |
| T | 迁移能力 (Transfer Ability) | `#ff9500` |
| Q | 思维品质 (Thinking Quality) | `#af52de` |
| S | 执行稳定 (Stability) | `#ff3b30` |

详见 [五维能力向量框架-理论文档.md](./五维能力向量框架-理论文档.md)。

---

## 项目文档索引

| 文档 | 用途 |
|------|------|
| [Code-Wiki.md](./Code-Wiki.md) | 项目技术百科（页面/云函数/数据模型详解） |
| [ROADMAP.md](./ROADMAP.md) | 开发路线图 |
| [设计语言规范.md](./设计语言规范.md) | UI 视觉规范（Apple/Notion 白色简约） |
| [前端视觉与动画工程经验.md](./前端视觉与动画工程经验.md) | 动画与交互工程实践 |
| [知识库架构决策文档.md](./知识库架构决策文档.md) | 架构选型决策记录 |
| [CLAUDE.md](./CLAUDE.md) | AI 行为规则 |
| [coding-rules.md](./coding-rules.md) | 编码铁律 |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 微信小程序原生框架（WXML + WXSS + JS） |
| 后端 | 微信云开发 CloudBase（云函数 + 云数据库 + 云存储） |
| 图形 | Canvas 2D API（环形图、雷达图） |
| CI | Reasonix + 五阶段门禁系统 |

---

## License

MIT
