# AI 学习助手 · Code Wiki

> 项目名称：AI 学习助手（微信小程序）
> 文档版本：v1.1
> 生成日期：2026-07-07
> AppID：`wx256aa9c197b2e59e`
> 云环境：`cloud1-d8g0ty39wd73f430a`

---

## 目录

1. [项目概览](#一项目概览)
2. [整体架构](#二整体架构)
3. [目录结构](#三目录结构)
4. [核心理论：五维能力向量框架](#四核心理论五维能力向量框架)
5. [入口与全局配置](#五入口与全局配置)
6. [页面模块详解](#六页面模块详解)
7. [云函数模块详解](#七云函数模块详解)
8. [公共组件](#八公共组件)
9. [数据模型与存储](#九数据模型与存储)
10. [依赖关系](#十依赖关系)
11. [项目运行方式](#十一项目运行方式)
12. [关键流程时序](#十二关键流程时序)
13. [设计约定与待开发项](#十三设计约定与待开发项)

---

## 一、项目概览

### 1.1 项目定位

本项目是一个面向 K12 学生的 **AI 个性化学习助手** 微信小程序，基于「五维能力向量模型」理论框架，旨在用量化、可操作的方式刻画学生在某一学科上的「真实掌握程度」，并提供个性化学习建议。

### 1.2 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | 微信小程序原生框架 | WXML + WXSS + JavaScript |
| 后端 | 微信云开发（CloudBase） | 云函数 + 云数据库 + 云存储 |
| 图形渲染 | Canvas 2D API | 掌握度环形图、五维能力图谱 |
| 依赖 SDK | wx-server-sdk | 云函数运行时 SDK |

### 1.3 核心能力

- **用户体系**：基于微信登录的免注册账号体系，头像/昵称自定义
- **学习首页**：学科切换、掌握度可视化、今日学习建议
- **AI 对话学习**：聊天式学习交互界面（当前为模拟回复）
- **五维能力图谱**：Canvas 绘制的可交互雷达图，支持点击缩放聚焦
- **个人中心**：学习统计、学科进度、功能菜单（部分待开发）

---

## 二、整体架构

### 2.1 架构分层

```
┌─────────────────────────────────────────────────┐
│              微信小程序客户端 (miniprogram)         │
│  ┌──────────┬──────────┬──────────┬──────────┐  │
│  │  登录页   │  首页    │  学习页   │  图谱页   │  │
│  │  login   │  index   │  study   │  graph   │  │
│  └──────────┴──────────┴──────────┴──────────┘  │
│  ┌──────────┬──────────────────────────────┐    │
│  │  我的页   │  维度详情页 dimension-detail │    │
│  │  mine   │                              │    │
│  └──────────┴──────────────────────────────┘    │
│            全局状态：app.globalData.userInfo      │
└───────────────────────┬─────────────────────────┘
                        │ wx.cloud.callFunction
                        │ wx.cloud.uploadFile
                        ▼
┌─────────────────────────────────────────────────┐
│              微信云开发 (CloudBase)               │
│  ┌──────────────────┬──────────────────────┐    │
│  │  userLogin 云函数  │ quickstartFunctions │    │
│  │  (用户登录/注册)    │  (示例 CRUD 集合)    │    │
│  └──────────────────┴──────────────────────┘    │
│  ┌─────────────────────────────────────────┐    │
│  │  云数据库 users 集合                      │    │
│  │  云存储 avatars/ 目录（用户头像）          │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### 2.2 架构特点

1. **前后端一体**：小程序原生 + 云开发，无需独立服务器
2. **私有协议鉴权**：云函数通过 `wx.getWXContext()` 获取 openid，天然鉴权
3. **本地缓存恢复**：登录态通过 `wx.setStorageSync` 持久化，启动时自动恢复
4. **Canvas 自绘**：所有可视化图表均用 Canvas 2D 手动绘制，无第三方图表库

---

## 三、目录结构

```
ai学习系统开发/
├── miniprogram/                    # 小程序前端代码
│   ├── app.js                      # 应用入口（全局数据、云开发初始化）
│   ├── app.json                    # 全局配置（页面注册、tabBar、window）
│   ├── app.wxss                    # 全局样式
│   ├── envList.js                  # 环境列表（当前为空占位）
│   ├── sitemap.json                # 小程序索引规则
│   ├── assets/                     # 资源目录
│   │   └── icons/study.svg
│   ├── components/                 # 自定义组件
│   │   └── cloudTipModal/          # 云开发提示弹窗组件
│   ├── images/                     # 图片资源（图标、占位图等）
│   └── pages/                      # 业务页面
│       ├── login/                  # 登录页
│       ├── index/                  # 首页
│       ├── study/                  # AI 学习对话页
│       ├── graph/                  # 五维能力图谱页
│       ├── mine/                   # 个人中心
│       ├── dimension-detail/       # 维度详情页
│       ├── knowledge-tree/         # 知识树展示页
│       ├── model-cards/            # 模型卡页
│       ├── method-list/            # 方法列表页
│       └── admin/knowledge-admin/  # 知识管理后台
├── cloudfunctions/                 # 云函数
│   ├── userLogin/                  # 用户登录/注册云函数
│   ├── manageKnowledge/            # 知识库管理云函数
│   └── quickstartFunctions/        # 云开发示例云函数
├── .reasonix/                      # Reasonix 配置（PreToolUse Hook、7个 Skill）
├── scripts/                        # 门禁脚本
│   ├── gate.sh                     # 统一门禁 CLI
│   ├── doc-gate.sh                 # 阶段门禁管理
│   ├── gate-hook.sh                # PreToolUse 门禁 Hook
│   └── verify-coding.sh            # 编码验证脚本
├── project.config.json             # 项目配置（appid、编译设置）
├── project.private.config.json     # 项目私有配置（覆盖上面）
├── uploadCloudFunction.sh          # 云函数上传脚本
├── README.md                       # 项目说明
├── CLAUDE.md                       # AI 行为规则（门禁流程）
├── coding-rules.md                 # 编码铁律
├── ROADMAP.md                      # 开发路线图
├── .gitignore
└── 五维能力向量框架-理论文档.md      # 核心理论文档
```

---

## 四、核心理论：五维能力向量框架

本项目的核心理论来源于 [五维能力向量框架-理论文档.md](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/%E4%BA%94%E7%BB%B4%E8%83%BD%E5%8A%9B%E5%90%91%E9%87%8F%E6%A1%86%E6%9E%B6-%E7%90%86%E8%AE%BA%E6%96%87%E6%A1%A3.md)，用一个五维向量刻画学科掌握程度：

```
M = (K, A, T, Q, S)
```

| 维度 | 名称 | 模型 | 数据来源 | 颜色 | 图标 |
|------|------|------|---------|------|------|
| K | 知识掌握 (Knowledge Mastery) | BKT + 知识图谱 DAG + 遗忘曲线 | 日常答题记录 | `#007aff` | 📖 |
| A | 能力水平 (Ability Level) | IRT 1PL (Rasch 模型) | 综合卷/模拟考 | `#34c759` | 📊 |
| T | 迁移能力 (Transfer Ability) | 迁移题正确率 × 解法多样性 | 每周迁移题 | `#ff9500` | 🔄 |
| Q | 思维品质 (Thinking Quality) | 解法丰富度 + 卡壳恢复率 + 反思深度 | 思考路径记录 | `#af52de` | 🧠 |
| S | 执行稳定 (Stability) | θ标准差 + 时间偏离度 + 计算失误率 | 模拟考 + 心理自评 | `#ff3b30` | 🎯 |

> 隐性维度 **P（学科品味）** 不纳入日常雷达图，仅作长期成长见证指标。

该框架在 [graph.js](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/miniprogram/pages/graph/graph.js) 的 `dimensions` 数据中落地为五个维度的可视化节点。

---

## 五、入口与全局配置

### 5.1 [app.js](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/miniprogram/app.js)

应用入口，负责全局状态与云开发初始化。

```javascript
App({
  globalData: {
    userInfo: null,                              // 全局用户信息（登录后填充）
    env: 'cloud1-d8g0ty39wd73f430a'              // 云开发环境 ID
  },
  onLaunch() {
    // 1. 从本地缓存恢复登录状态（需有完整 _openid + nickName）
    const cached = wx.getStorageSync('userInfo');
    if (cached && cached._openid && cached.nickName) {
      this.globalData.userInfo = cached;
    }
    // 2. 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 以上基础库');
    } else {
      wx.cloud.init({ env: this.globalData.env, traceUser: true });
    }
  }
});
```

**关键说明**：
- `globalData.userInfo` 是全局登录态的唯一来源，所有页面通过 `getApp().globalData.userInfo` 读取
- 缓存恢复条件较严格：必须同时包含 `_openid` 和 `nickName`，防止脏数据

### 5.2 [app.json](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/miniprogram/app.json)

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `navigationStyle` | `custom` | 全局自定义导航栏 |
| `backgroundColor` | `#f5f5f7` | iOS 风格浅灰背景 |
| `style` | `v2` | 使用新版组件样式 |
| `lazyCodeLoading` | `requiredComponents` | 按需注入组件代码 |

**页面注册顺序**（首项为启动页）：
1. `pages/login/login` — 登录页（启动页）
2. `pages/index/index` — 首页
3. `pages/study/study` — 学习页
4. `pages/graph/graph` — 图谱页
5. `pages/mine/mine` — 我的页
6. `pages/dimension-detail/dimension-detail` — 维度详情页
9. `pages/knowledge-tree/knowledge-tree` — 知识树页
10. `pages/model-cards/model-cards` — 模型卡页
11. `pages/method-list/method-list` — 方法列表页
12. `pages/admin/knowledge-admin/knowledge-admin` — 知识管理后台

**TabBar 配置**（4 个标签）：

| 标签 | 路径 | 文字 |
|------|------|------|
| 首页 | `pages/index/index` | 首页 |
| 学习 | `pages/study/study` | 学习 |
| 图谱 | `pages/graph/graph` | 图谱 |
| 我的 | `pages/mine/mine` | 我的 |

主题色：选中 `#007aff`（iOS 蓝），未选中 `#8e8e93`（iOS 灰）。

### 5.3 [project.config.json](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/project.config.json)

| 字段 | 值 | 说明 |
|------|-----|------|
| `miniprogramRoot` | `miniprogram/` | 小程序代码根目录 |
| `cloudfunctionRoot` | `cloudfunctions/` | 云函数根目录 |
| `appid` | `wx256aa9c197b2e59e` | 小程序 AppID |
| `libVersion` | `3.16.2` | 基础库版本 |

---

## 六、页面模块详解

### 6.1 登录页 [pages/login/](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/miniprogram/pages/login/login.js)

**职责**：用户首次进入的登录授权页，采集头像与昵称，调用云函数完成注册/登录。

**关键函数**：

| 函数 | 作用 |
|------|------|
| `onChooseAvatar(e)` | 监听微信 `chooseAvatar` 开放能力，获取用户头像临时路径 |
| `onNicknameInput(e)` | 监听 `nickname` 类型输入框，获取微信昵称 |
| `onLogin()` | 登录主流程入口，校验后触发 `wx.login` |
| `uploadAvatar(callback)` | 将临时头像上传至云存储 `avatars/` 目录，返回 fileID |
| `loginFail(msg)` | 登录失败统一处理（恢复按钮、隐藏 loading、提示） |

**数据流**：
```
用户选头像+昵称 → wx.login 获取 code
  → uploadAvatar 上传头像到云存储得到 fileID
  → wx.cloud.callFunction('userLogin', {nickName, avatarUrl:fileID})
  → 成功：写入 app.globalData.userInfo + wx.setStorageSync → switchTab 到首页
  → 失败：loginFail 提示
```

**校验规则**：必须填写昵称且选择头像（不能是默认 `avatar.png`）才允许登录。

---

### 6.2 首页 [pages/index/](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/miniprogram/pages/index/index.js)

**职责**：学习总览页，展示学科切换、学习统计、掌握度环形图、今日建议。

**关键函数**：

| 函数 | 作用 |
|------|------|
| `onLoad()` | 从 `globalData.userInfo` 读取用户名与连续学习天数 |
| `onShow()` | 刷新用户名（从其他页返回时同步） |
| `drawRing(pct)` | 用 Canvas 2D 绘制掌握度环形进度图（背景圆 + 进度圆弧） |
| `onSubjectChange()` | 学科切换时更新掌握度与建议（当前为 mock 数据） |
| `prevSubject()` / `nextSubject()` | 左右切换学科（循环） |
| `goStudy()` | 跳转到学习页 |

**Mock 数据说明**：
当前 `mockMastery` 与 `mockSuggest` 为硬编码的学科掌握度与建议文案，覆盖数学/英语/物理/语文/化学五科，后续需替换为真实数据。

**Canvas 绘制要点**：
- 使用 `wx.createSelectorQuery().select().node()` 获取 Canvas 2D 节点
- 通过 `dpr` 适配高分屏：`canvas.width = 320 * dpr`，`ctx.scale(dpr, dpr)`
- 进度弧起点为 `-π/2`（正上方），顺时针绘制

---

### 6.3 学习页 [pages/study/](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/miniprogram/pages/study/study.js)

**职责**：AI 对话式学习界面，用户输入问题，AI 返回讲解。

**关键函数**：

| 函数 | 作用 |
|------|------|
| `changeSubject(e)` | picker 切换学科，重置对话消息 |
| `onInput(e)` | 输入框监听，控制发送按钮可用状态 |
| `sendMessage()` | 发送消息主流程（添加用户消息 → 模拟延迟 → 添加 AI 回复） |
| `addMsg(content, isUser)` | 向消息列表追加一条消息并触发滚动到底部 |
| `getReply(q)` | 模拟 AI 回复（基于关键词匹配 + 默认模板） |

**当前状态**：AI 回复为本地 mock，仅匹配「二次函数顶点公式」「英语时态」「牛顿定律」三个关键词，其余返回通用模板。**后续需对接真实 AI 接口**。

**交互细节**：
- AI 回复延迟 `800 + random*600` ms 模拟思考
- 加载中显示三点 `typing` 动画
- 消息支持 `slide-up` 进入动画

---

### 6.4 图谱页 [pages/graph/](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/miniprogram/pages/graph/graph.js)

**职责**：五维能力向量模型的可视化页面，是本项目最核心的可视化模块。用 Canvas 绘制可交互的五维能力雷达图，支持点击节点缩放聚焦。

**内部状态（非 setData）**：
为避免 setData 性能开销，Canvas 相关状态存于实例属性：

| 属性 | 类型 | 作用 |
|------|------|------|
| `_canvas` | Canvas | Canvas 2D 节点 |
| `_ctx` | Context | 2D 绘制上下文 |
| `_dpr` | number | 设备像素比 |
| `_size` | number | 画布逻辑尺寸 |
| `_scale` | number | 镜头缩放系数 |
| `_offX` / `_offY` | number | 镜头偏移量 |
| `_animTimer` | timer | 缩放动画定时器 |
| `_nodePositions` | array | 五个维度节点的命中位置 |
| `_centerPos` | object | 中心节点位置 |

**关键函数**：

| 函数 | 作用 |
|------|------|
| `onLoad()` | 计算画布尺寸（取屏幕宽与 600 的较小值）与 dpr |
| `onShow()` | 初始化 Canvas |
| `initCanvas()` | 通过 SelectorQuery 获取 Canvas 节点并触发首次绘制 |
| `getNodePositions()` | 计算五个维度节点的圆周位置（均分 2π，起始 -π/2） |
| `drawGraph()` | **核心绘制函数**：清屏 → 镜头变换 → 画连线/虚线/中心节点/五个维度节点 |
| `onCanvasTap(e)` | 点击命中检测：遍历节点判断距离，命中则 `zoomToNode` |
| `zoomToNode(dimIdx)` | 计算目标缩放参数（scale=2.5），启动动画聚焦到该节点 |
| `zoomOut()` | 缩放回全局视图 |
| `animateZoom(...)` | ease-out cubic 缓动动画（300ms，16ms 帧间隔） |
| `goDetail()` | 跳转维度详情页，透传 dim/name/icon/value/color/subject 参数 |

**绘制层次**（从底到顶）：
1. 五个节点两两连线（五边形）
2. 中心到各节点的彩色虚线
3. 中心节点（学科名，径向渐变蓝色圆 + 阴影）
4. 五个维度节点（半透明填充 + 彩色描边 + 图标 + 数值 + 标签）

**交互流程**：
```
点击节点 → zoomToNode → animateZoom(300ms ease-out) → 显示"查看详情"按钮
       → 点击按钮 → navigateTo dimension-detail
       → 点击遮罩 → zoomOut 退出聚焦
```

**维度数据**（五维能力向量的可视化）：

| id | name | icon | color | value | desc |
|----|------|------|-------|-------|------|
| K | 知识掌握 | 📖 | #007aff | 57 | 概念·模型·技能的掌握程度 |
| A | 能力水平 | 📊 | #34c759 | 72 | 学科综合能力指数 |
| T | 迁移能力 | 🔄 | #ff9500 | 45 | 陌生场景调用知识的能力 |
| S | 执行稳定 | 🎯 | #ff3b30 | 68 | 发挥一致性与计算准确率 |
| Q | 思维品质 | 🧠 | #af52de | 55 | 反思习惯与策略意识 |

---

### 6.5 我的页 [pages/mine/](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/miniprogram/pages/mine/mine.js)

**职责**：个人中心，展示用户信息、学习统计、学科进度、功能菜单。

**关键函数**：

| 函数 | 作用 |
|------|------|
| `onLoad()` / `onShow()` | 调用 `loadUserData` 刷新数据 |
| `loadUserData()` | 从 `globalData.userInfo` 读取并校验头像路径合法性 |
| `goLogin()` | 未登录时跳转登录页 |
| `goSetting()` / `goReport()` / `goAchievement()` | 菜单项跳转（当前均提示「开发中」） |

**头像合法性校验**：仅接受 `cloud://` 或 `http` 开头的路径，否则回退到默认头像 `/images/avatar.png`。

**菜单项**：
- 📷 学习设置 → 开发中
- 📊 学习报告 → 开发中
- 🏆 成就墙 → 开发中

---

### 6.6 维度详情页 [pages/dimension-detail/](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/miniprogram/pages/dimension-detail/dimension-detail.js)

**职责**：从图谱页跳转而来，展示某一维度的详情（当前为占位页，待开发）。

**参数接收**（通过 `onLoad(options)`）：
- `dim` — 维度 ID（K/A/T/S/Q）
- `name` — 维度名称
- `icon` — 维度图标
- `value` — 当前水平值
- `color` — 维度颜色（URL 编码后透传，需 `decodeURIComponent`）
- `subject` — 学科名

当前页面仅展示图标、名称、水平值与「待开发」徽章。

---

## 七、云函数模块详解

### 7.1 [userLogin](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/cloudfunctions/userLogin/index.js)

**职责**：用户登录与注册的核心云函数，实现「登录即注册」的免注册体系。

**入口**：`exports.main = async (event) => {...}`

**入参**：

| 字段 | 类型 | 说明 |
|------|------|------|
| nickName | string | 用户昵称 |
| avatarUrl | string | 头像地址（cloud:// fileID） |
| grade | string | 年级（可选） |

**业务流程**：

```
1. cloud.getWXContext() 获取 openid（微信私有协议鉴权）
2. 查询 users 集合 where _openid == openid
3. 若存在 → 更新 lastLogin（及 nickName/avatarUrl/grade）→ 返回最新数据
4. 若不存在 → 创建新用户文档（含五维能力初始字段）→ 返回新数据
5. 异常 → 返回 {code: -1, message: '登录失败，请重试'}
```

**新用户默认数据结构**：
```javascript
{
  _openid, nickName, avatarUrl,
  grade: 'junior_to_senior',       // 默认年级：高中
  subjects: ['数学', '英语'],       // 默认学科
  createdAt, lastLogin,            // 时间戳
  currentStreak: 1, longestStreak: 1, lastStudyDate: '',
  totalStudyMinutes: 0,
  kOverall: 0, aOverall: 0,        // 五维能力总分
  tOverall: 0, sOverall: 0, qOverall: 0,
  subjectStats: {}                 // 各学科统计
}
```

**返回值**：
```javascript
{ code: 0, data: { ...userDoc } }    // 成功
{ code: -1, message: '登录失败...' }  // 失败
```

**依赖**：`wx-server-sdk`（latest）

---

### 7.2 [quickstartFunctions](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/cloudfunctions/quickstartFunctions/index.js)

**职责**：云开发官方示例云函数集合，演示数据库 CRUD 与小程序码生成，**非本项目核心业务**。

**路由方式**：通过 `event.type` 字段分发到不同处理函数。

| type 值 | 函数 | 作用 |
|---------|------|------|
| `getOpenId` | getOpenId | 返回 openid/appid/unionid |
| `getMiniProgramCode` | getMiniProgramCode | 生成首页小程序码并上传云存储 |
| `createCollection` | createCollection | 创建 sales 集合并插入示例数据 |
| `selectRecord` | selectRecord | 查询 sales 集合全部记录 |
| `updateRecord` | updateRecord | 批量更新 sales 记录 |
| `insertRecord` | insertRecord | 新增 sales 记录 |
| `deleteRecord` | deleteRecord | 删除 sales 记录 |

**权限配置**（[config.json](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/cloudfunctions/quickstartFunctions/config.json)）：仅申请 `wxacode.get`（小程序码生成）权限。

**依赖**：`wx-server-sdk ~2.4.0`

> 说明：此云函数为云开发模板自带，可保留作参考，也可在后续清理中移除。

---

## 八、公共组件

### 8.1 [cloudTipModal](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/miniprogram/components/cloudTipModal/index.js)

**职责**：通用提示弹窗组件，半透明遮罩 + 居中卡片，支持标题与内容。

| 类型 | 字段 | 说明 |
|------|------|------|
| properties | `showTipProps` | Boolean，是否显示（外部控制） |
| properties | `title` | String，标题 |
| properties | `content` | String，内容 |
| data | `showTip` | Boolean，内部显示状态 |
| methods | `onClose()` | 关闭弹窗 |

**observers**：监听 `showTipProps` 变化，同步到内部 `showTip`。

> 此组件源自云开发模板，当前业务页面未引用，可按需启用。

---

## 九、数据模型与存储

### 9.1 云数据库集合

#### `users` 集合（核心业务集合）

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 文档 ID（系统自动） |
| `_openid` | string | 微信 openid（用户唯一标识） |
| `nickName` | string | 昵称 |
| `avatarUrl` | string | 头像 cloud:// fileID |
| `grade` | string | 年级，默认 `junior_to_senior` |
| `subjects` | string[] | 学习学科列表 |
| `createdAt` | date | 注册时间 |
| `lastLogin` | date | 最近登录时间 |
| `currentStreak` | number | 当前连续学习天数 |
| `longestStreak` | number | 最长连续学习天数 |
| `lastStudyDate` | string | 上次学习日期 |
| `totalStudyMinutes` | number | 累计学习分钟数 |
| `kOverall` | number | K 维度总分 |
| `aOverall` | number | A 维度总分 |
| `tOverall` | number | T 维度总分 |
| `sOverall` | number | S 维度总分 |
| `qOverall` | number | Q 维度总分 |
| `subjectStats` | object | 各学科详细统计 |

#### `sales` 集合（示例集合，非业务数据）

由 `quickstartFunctions` 创建，字段：`region`、`city`、`sales`。

### 9.2 云存储

| 路径 | 用途 | 上传方 |
|------|------|--------|
| `avatars/{timestamp}.{random}.{ext}` | 用户头像 | 登录页 `uploadAvatar` |
| `code.png` | 小程序码（示例） | quickstartFunctions |

### 9.3 本地缓存

| Key | 值 | 读写时机 |
|-----|-----|---------|
| `userInfo` | 完整用户文档 | 登录成功写入 / app.onLaunch 读取恢复 |

---

## 十、依赖关系

### 10.1 npm 依赖

| 包名 | 版本 | 使用位置 | 作用 |
|------|------|---------|------|
| `wx-server-sdk` | latest | cloudfunctions/userLogin | 云函数运行时 SDK |
| `wx-server-sdk` | ~2.4.0 | cloudfunctions/quickstartFunctions | 云函数运行时 SDK |

> 小程序前端无 npm 依赖，全部使用微信原生 API。

### 10.2 模块间依赖关系

```
app.js (globalData.userInfo)
   ▲
   │ 读取登录态
   │
   ├─ login.js ──── 调用 ──→ userLogin 云函数 ──→ users 集合
   │     │
   │     └── 上传头像 ──→ 云存储 avatars/
   │
   ├─ index.js ──── 读取 globalData.userInfo（用户名、streak）
   │
   ├─ study.js ──── 独立（无外部依赖，mock 数据）
   │
   ├─ graph.js ──── 独立绘制 Canvas（dimensions 内置数据）
   │     │
   │     └── navigateTo ──→ dimension-detail.js（透传参数）
   │
   └─ mine.js ───── 读取 globalData.userInfo（用户名、头像、streak、subjects）
```

### 10.3 全局状态流转

```
            wx.login + userLogin 云函数
                      │
                      ▼
        app.globalData.userInfo = res.data
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
      index.js    mine.js     wx.setStorageSync
       (展示)      (展示)       (持久化缓存)
                      │
                      ▼
            app.onLaunch 下次启动恢复
```

---

## 十一、项目运行方式

### 11.1 环境准备

1. **安装微信开发者工具**：最新稳定版（需支持基础库 2.20.1+）
2. **注册微信小程序账号**：获取 AppID（当前项目 AppID：`wx256aa9c197b2e59e`）
3. **开通云开发**：在开发者工具中创建云环境（当前环境：`cloud1-d8g0ty39wd73f430a`）

### 11.2 本地运行

1. 用微信开发者工具打开项目根目录 `/Users/apple/Desktop/ai学习系统开发`
2. 在工具内确认 `project.config.json` 中的 `appid` 与你的小程序一致
3. 确认 `app.js` 中 `globalData.env` 指向你的云环境 ID
4. **上传并部署云函数**：
   - 右键 `cloudfunctions/userLogin` → 「上传并部署：云端安装依赖」
   - 右键 `cloudfunctions/quickstartFunctions` → 「上传并部署：云端安装依赖」
5. **创建数据库集合**：在云开发控制台手动创建 `users` 集合（或将权限设置为「所有用户可读，仅创建者可写」）
6. 点击开发者工具的「编译」按钮即可在模拟器预览

### 11.3 云函数批量上传脚本

项目根目录提供 [uploadCloudFunction.sh](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/uploadCloudFunction.sh)：

```bash
${installPath} cloud functions deploy --e ${envId} --n quickstartFunctions --r --project ${projectPath}
```

> 该脚本依赖外部变量 `installPath`、`envId`、`projectPath`，需在 CI/CD 环境中预先定义，本地一般用开发者工具右键上传即可。

### 11.4 真机预览

1. 点击开发者工具「预览」生成二维码
2. 用微信扫码即可在手机上体验
3. 注意：`chooseAvatar` 与 `nickname` 开放能力需在真机上才能完整触发

### 11.5 调试建议

- 登录流程日志：`login.js` 中已有 `console.log('[login] ...')` 前缀日志
- 用户数据日志：`mine.js` 中 `console.log('[mine] user from globalData:', user)`
- 云函数日志：在云开发控制台 → 云函数 → 日志 查看

---

## 十二、关键流程时序

### 12.1 登录流程

```
用户                小程序                云存储            userLogin云函数         users集合
 │                   │                     │                    │                   │
 │ 选头像+昵称         │                     │                    │                   │
 │────点击登录──────→│                     │                    │                   │
 │                   │ wx.login获取code     │                    │                   │
 │                   │ uploadAvatar         │                    │                   │
 │                   │────上传头像─────────→│                    │                   │
 │                   │←──返回fileID─────────│                    │                   │
 │                   │ callFunction(userLogin,{nickName,fileID}) │                   │
 │                   │──────────────────────────────────────────→│                   │
 │                   │                     │ getWXContext(openid)│                   │
 │                   │                     │                    │──where openid──→│
 │                   │                     │                    │←──用户记录────────│
 │                   │                     │              (存在)更新/不存在新建       │
 │                   │                     │                    │──upsert─────────→│
 │                   │←──{code:0,data:user}─────────────────────│                   │
 │                   │ globalData.userInfo=user                 │                   │
 │                   │ setStorageSync('userInfo',user)          │                   │
 │                   │ switchTab→index                          │                   │
```

### 12.2 图谱交互流程

```
用户                graph.js              Canvas
 │                   │                     │
 │ 切换学科           │                     │
 │──picker选择──→ changeSubject            │
 │                   │ reset _scale/_offX  │
 │                   │ drawGraph()────────→│ 重绘
 │                   │                     │
 │ 点击维度节点        │                     │
 │──tap canvas──→ onCanvasTap              │
 │                   │ 命中检测(距离<r+8)    │
 │                   │ zoomToNode(dimIdx)   │
 │                   │ animateZoom(300ms)──→│ ease-out 缩放动画
 │                   │ showDetailBtn=true   │
 │                   │                     │
 │ 点击"查看详情"      │                     │
 │──tap detail──→ goDetail                 │
 │                   │ navigateTo dimension-detail?dim=K&...
 │                   │                     │
 │ 点击遮罩退出        │                     │
 │──tap overlay──→ zoomOut                 │
 │                   │ animateZoom(回 1.0)─→│ 缩放回全局
```

---

## 十三、编码门禁系统（Coding Enforcement Kit）

项目集成了基于 Reasonix 的五阶段门禁系统，所有编码工作必须按流程推进。

### 13.1 五阶段流程

```
PRD → 架构 → 详细设计 → 编码 → 代码评审
```

### 13.2 关键组件

| 组件 | 位置 | 作用 |
|------|------|------|
| `gate.sh` | `scripts/gate.sh` | 统一门禁 CLI（status/check/pass/unpass/pre/post） |
| `gate-hook.sh` | `scripts/gate-hook.sh` | PreToolUse Hook，编辑代码前检查上游阶段是否完成 |
| `.reasonix/settings.json` | 项目根目录 | Hook 配置，拦截 `edit_file`/`write_file` |
| `CLAUDE.md` | 项目根目录 | AI 行为规则（禁止跳步、自动推进） |
| `coding-rules.md` | 项目根目录 | 各阶段详细执行流程 |

### 13.3 人肉评审门

每个文档阶段（PRD/架构/详细设计）归零后，必须用 `ask()` 工具向用户展示关键决策摘要，等待用户确认后再 `gate.sh pass`。避免 AI 自循环导致需求偏差。

### 13.4 7 个 Skill

| Skill | 职责 |
|-------|------|
| `conductor` | 全自动编排五阶段管道 |
| `prd-writer` | 产 PRD 需求文档（多轮访谈 + 5W1H 框架） |
| `system-architect` | 系统架构设计 |
| `task-decomposer` | 模块级详细设计 |
| `gatekeeper` | 按设计文档编码（唯一有 edit/write 权限的 Skill） |
| `code-reviewer` | 代码质量审查 |
| `review-expert` | 文档评审（PRD/架构/详细设计） |

---

## 十四、设计约定与待开发项

### 14.1 设计约定

1. **颜色规范**（iOS 设计语言）：
   - 主色 `#007aff`（蓝）、成功 `#34c759`（绿）、警告 `#ff9500`（橙）
   - 危险 `#ff3b30`（红）、紫色 `#af52de`
   - 文字主 `#1d1d1f`、次要 `#8e8e93`、背景 `#f5f5f7`
2. **单位**：全部使用 `rpx`（750 设计稿基准），JS 中通过 `windowWidth/750` 转 px
3. **导航**：全局 `navigationStyle: custom`，各页自绘导航栏
4. **登录态管理**：单一来源 `app.globalData.userInfo`，配合 `wx.setStorageSync` 持久化

### 14.2 待开发项

| 模块 | 当前状态 | 待办 |
|------|---------|------|
| study 页 AI 回复 | mock 关键词匹配 | 对接真实 AI 大模型接口 |
| index 页掌握度 | 硬编码 mock 数据 | 接入 users 集合的 kOverall 等字段 |
| mine 页学习统计 | 全部为 0 | 接入 totalStudyMinutes、subjectStats |
| dimension-detail | 占位页 | 实现维度详情展示与提升建议 |
| mine 页菜单 | 均提示「开发中」 | 实现学习设置/学习报告/成就墙 |
| 五维能力数据 | graph 页硬编码 | 接入真实 BKT/IRT 计算结果 |
| 迁移能力 T | 理论已有 | 实现每周迁移题采集 |
| 思维品质 Q | 理论已有 | 实现思考路径记录 |
| 执行稳定 S | 理论已有 | 接入模拟考 + 心理自评 |
| 学科拓展 | 数学/英语等 5 科 mock | Core+Adapter 全科适配 |

### 14.3 已知技术债

- `envList.js` 为空占位，未实际使用
- `quickstartFunctions` 为模板自带，与业务无关，可考虑清理
- `graph.js` 的 `dimensions` 数据与 `userLogin` 云函数的 `kOverall` 等字段尚未打通
- 缺少全局错误上报与埋点机制

---

## 附录：关键文件速查表

| 文件 | 行数 | 核心职责 |
|------|------|---------|
| [app.js](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/miniprogram/app.js) | 23 | 全局状态 + 云开发初始化 |
| [app.json](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/miniprogram/app.json) | 50 | 页面注册 + tabBar 配置 |
| [login.js](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/miniprogram/pages/login/login.js) | 97 | 登录主流程 + 头像上传 |
| [index.js](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/miniprogram/pages/index/index.js) | 105 | 首页总览 + 环形图绘制 |
| [study.js](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/miniprogram/pages/study/study.js) | 67 | AI 对话学习 |
| [graph.js](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/miniprogram/pages/graph/graph.js) | 310 | 五维能力图谱（最复杂） |
| [mine.js](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/miniprogram/pages/mine/mine.js) | 73 | 个人中心 |
| [dimension-detail.js](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/miniprogram/pages/dimension-detail/dimension-detail.js) | 27 | 维度详情占位页 |
| [userLogin/index.js](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/cloudfunctions/userLogin/index.js) | 74 | 用户登录/注册云函数 |
| [manageKnowledge/index.js](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/cloudfunctions/manageKnowledge/index.js) | 90 | 知识库 CRUD 云函数 |
| [quickstartFunctions/index.js](file:///Users/apple/Desktop/ai%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%E5%BC%80%E5%8F%91/cloudfunctions/quickstartFunctions/index.js) | 185 | 示例云函数集合 |

---

*文档结束 · 基于 2026-07-07 代码快照生成*
