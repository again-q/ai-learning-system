# AI 学习助手

> 基于「五维能力向量模型」的 K12 个性化 AI 学习小程序
> 微信小程序原生开发 + 云开发（CloudBase）

[![Platform](https://img.shields.io/badge/Platform-WeChat_MiniProgram-07c160.svg)](https://developers.weixin.qq.com/miniprogram/)
[![Cloud](https://img.shields.io/badge/Cloud-CloudBase-007aff.svg)](https://cloud.weixin.qq.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 项目简介

AI 学习助手是一款面向 K12 学生的小程序，核心创新是**五维能力向量模型**——把每个学科的学习能力拆解为 5 个独立维度，用向量 `M = (K, A, T, Q, S)` 精细刻画学生在每个学科上的能力分布，避免「一个总分掩盖所有薄弱点」的传统评分弊端。

### 核心特性

- 🧠 **五维能力建模** — 知识、应用、思维、问题解决、速度五维独立评估
- 📊 **知识图谱可视化** — 中心辐射结构 + Canvas 自绘 + 镜头缩放交互
- 💬 **AI 对话教学** — 学科场景化的智能问答辅导
- 📈 **学习数据追踪** — 连续学习天数、今日学习时长、知识点掌握度
- 🎨 **统一简约视觉** — 全 App 共用设计 Token，流畅的动画反馈

---

## 五维能力模型

每个学科的学习能力被建模为五维向量：

| 维度 | 符号 | 含义 |
|------|------|------|
| Knowledge | K | 知识储备（概念、公式、定理的掌握） |
| Application | A | 知识应用（标准题型的解题能力） |
| Thinking | T | 思维能力（推理、归纳、迁移） |
| Problem Solving | Q | 问题解决（综合题、开放题） |
| Speed | S | 解题速度与准确率 |

> 详细理论见 [五维能力向量框架-理论文档.md](五维能力向量框架-理论文档.md)

---

## 项目结构

```
ai-learning-system/
├── miniprogram/              # 小程序前端
│   ├── app.js                # 全局逻辑 + 云开发初始化
│   ├── app.json              # 页面路由与 tabBar 配置
│   ├── app.wxss              # 全局样式
│   ├── images/               # 静态资源
│   ├── components/
│   │   └── cloudTipModal/    # 云函数提示组件
│   └── pages/
│       ├── login/            # 登录页（头像+昵称+一键登录）
│       ├── index/            # 首页（问候+学科切换+掌握度环形图）
│       ├── study/            # AI 对话学习页
│       ├── graph/            # 知识图谱页（Canvas 五维可视化）
│       ├── mine/             # 个人中心
│       └── dimension-detail/ # 维度详情页（待开发）
│
├── cloudfunctions/           # 云函数
│   ├── userLogin/            # 用户登录与资料同步
│   └── quickstartFunctions/  # 云开发模板函数
│
├── 五维能力向量框架-理论文档.md  # 核心理论说明
├── Code-Wiki.md              # 项目结构化开发文档
├── 设计语言规范.md            # 设计 Token 与视觉规范
├── 前端视觉与动画工程经验.md   # AI 助手协作复用经验
├── project.config.json       # 项目配置
└── README.md
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | 微信小程序原生（WXML + WXSS + JS） |
| **可视化** | Canvas 2D API（知识图谱自绘） |
| **后端** | 微信云开发（云函数 + 云数据库 + 云存储） |
| **数据库** | 云数据库 NoSQL（users 集合） |
| **AI 能力** | 预留 AI 对话接口（study 页） |

---

## 快速开始

### 环境要求

- 微信开发者工具（最新稳定版）
- 微信小程序 AppID
- 已开通微信云开发

### 本地运行

1. **克隆仓库**

   ```bash
   git clone https://github.com/again-q/ai-learning-system.git
   ```

2. **导入项目**

   打开微信开发者工具 → 导入项目 → 选择仓库根目录 → 填入你的 AppID

3. **开通云开发**

   - 工具栏点击「云开发」按钮，按提示开通
   - 记下你的**云环境 ID**

4. **配置云环境**

   打开 [miniprogram/app.js](miniprogram/app.js)，替换 `env` 为你的云环境 ID：

   ```js
   wx.cloud.init({
     env: 'your-cloud-env-id',
     traceUser: true
   });
   ```

5. **部署云函数**

   - 右键 `cloudfunctions/userLogin` → 「上传并部署：云端安装依赖」
   - 同样部署 `cloudfunctions/quickstartFunctions`

6. **初始化数据库**

   在云开发控制台创建 `users` 集合（权限设为「仅创建者可读写」）

7. **运行预览**

   点击工具栏「预览」或「真机调试」即可

---

## 核心页面

| 页面 | 路径 | 功能 |
|------|------|------|
| 登录页 | `pages/login` | 微信头像昵称授权 + 一键登录 |
| 首页 | `pages/index` | 问候语 + 学科切换 + 掌握度环形图 + 今日建议 |
| 学习页 | `pages/study` | AI 对话辅导 + 学科切换 + 打字动画 |
| 知识图谱 | `pages/graph` | 五维能力雷达图 + 中心辐射节点 + 镜头缩放交互 |
| 个人中心 | `pages/mine` | 学习统计 + 学科进度 + 功能菜单 |
| 维度详情 | `pages/dimension-detail` | 单维度详情（开发中） |

---

## 数据模型

用户数据存储在云数据库 `users` 集合，主要字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `_openid` | string | 微信 OpenID（主键） |
| `nickName` | string | 昵称 |
| `avatarUrl` | string | 头像云存储 fileID |
| `streak` | number | 连续学习天数 |
| `subjects` | array | 已选学科列表 |
| `kOverall` | number | 知识维度总分（预留） |
| `aOverall` | number | 应用维度总分（预留） |
| `tOverall` | number | 思维维度总分（预留） |
| `qOverall` | number | 问题解决维度总分（预留） |
| `sOverall` | number | 速度维度总分（预留） |
| `createdAt` | date | 注册时间 |

---

## 开发文档

- 📘 [Code-Wiki.md](Code-Wiki.md) — 项目结构化开发文档（架构、模块、流程）
- 🎨 [设计语言规范.md](设计语言规范.md) — 设计 Token 与视觉规范
- 🤖 [前端视觉与动画工程经验.md](前端视觉与动画工程经验.md) — AI 助手协作复用经验
- 🧠 [五维能力向量框架-理论文档.md](五维能力向量框架-理论文档.md) — 核心理论说明

---

## 项目状态

### 已完成

- ✅ 用户登录闭环（头像上传 + 云函数同步）
- ✅ 首页掌握度展示 + 学科切换
- ✅ AI 对话页 UI + 打字动画
- ✅ 知识图谱可视化（Canvas 五维辐射图 + 交互）
- ✅ 个人中心基础框架
- ✅ 全 App 视觉与动画体系统一

### 开发中

- 🚧 五维数据算法实现（BKT/IRT）
- 🚧 AI 对话接口对接
- 🚧 维度详情页内容填充
- 🚧 学习报告生成

### 待开发

- ⏳ 学习设置页
- ⏳ 成就墙
- ⏳ 错题本
- ⏳ 多学科知识库

---

## 开发协作

本项目采用**多 AI 助手协作**模式：

- **桌面端 AI 助手**（Reasonix）：负责后端云函数、数据模型、页面骨架生成
- **IDE 内 AI 助手**（TRAE）：负责前端视觉、动画、算法实现、架构梳理、文档

详细的协作规范与 Prompt 模板见 [前端视觉与动画工程经验.md](前端视觉与动画工程经验.md)。

---

## 贡献

欢迎提交 Issue 和 Pull Request。

---

## License

MIT
