# DSH 升级流程（线上 ai 学习平台）

> **文件分工**：
> - 本文件 = **DSH 运行时升级**的操作流程与验收标准（对象：线上 7 账号多租户平台）
> - `../decision-log.md` = 版本线/口径类关键决策
> - `./工程化与CI经验.md` = CI、部署、依赖、工具链经验
>
> **状态**：📝 流程已定稿，**尚未执行过任何升级**（基线建立也还没做）

---

## 一、为什么需要这个流程

### 1.1 平台与 DSH 的关系：不是依赖，是运行时

线上 `/opt/ai-platform` **不依赖** dsh 这个 npm 包——**dsh 就是平台的运行时本体**。每个账号一个独立实例：

```
/opt/ai-platform/data/instances/<账号>/dsh-home/     ← 该账号的全部会话与配置
```

启动方式（`server/app.mjs` 调起）：

```sh
node /usr/bin/dsh --profile again \
  --patch /opt/ai-platform/data/instances/again/skin.patch.yml \
  --trusted-host <三个域名> --no-open --port 3100
```

`/usr/bin/dsh → ../lib/node_modules/@deepseek-ai/dsh/lib/bin.js`（npm 全局装，root 所有）。

**推论：升级 dsh = 升级 7 个账号的生产运行时。** 这不是普通的依赖升级。

### 1.2 现况快照（2026-10-01 实测）

| 项 | 值 |
|---|---|
| 线上 dsh 版本 | `0.1.5-rc.2` |
| node | v22.23.2 |
| 账号数 | 7（`666 / admin / again / chanmian / gaosongdeng / qianzaoaiyin / whh`） |
| 数据量 | 约 116M；again 35M(13 会话)、qianzaoaiyin 70M(6 会话) |
| 会话文件 | **23 个**，**全部 `session.v3.jsonl.zstd`**，v4 = 0（逐账号：again 13 / qianzaoaiyin 6 / admin 2 / 666 1 / chanmian 1 / gaosongdeng 0 / whh 0） |
| 运行时长 | 当时的实例已连续运行 4 天 23 小时（重启即中断） |

---

## 二、升级风险的真实图景（初稿曾高估，已按实测更正）

这是本流程存在的**唯一理由**，也是最容易被低估的一点。

### 2.1 平台按"事件类型名"统计会话

`tools/dsh-session-export.mjs`（98 行）的解压与统计逻辑：

```js
// 扫 zstd 魔数 28 B5 2F FD → 逐 frame 解压 → JSON.parse → 按 type 归类
轮次:     kinds["turn/start"]
用户消息: kinds["user/message"]
AI消息:   kinds["assistant/message"]
工具调用: kinds["tool/call"]
交付物:   kinds["deliverables/presented"]
```

### 2.2 0.2.0 引入 v4 —— **实测：统计口径未被破坏** ✅

0.2.0 新增 `dsh-session-format-v3-to-v4`，catalog 从支持 v0–v3 扩到 **v0–v4**。README 描述该迁移会：

> **lifts tool results**、**renames message sources**、closes interrupted turns、appends parent catalog facts

**读到这里时，本文件初稿判定「这会静默破坏平台统计口径」。该判断已被实测证伪，现更正如下。**

#### 实测方法与结果（2026-10-01）

本机安装官方桌面版 `0.2.0-rc.2` 后，它已真实写出 3 个 `session.v4.jsonl.zstd`。用平台**现有解析逻辑**（扫魔数 → 逐 frame 解压 → `JSON.parse` → 按 `type` 归类）直接读 v4 文件：

| 平台统计键 | v3 样本 | v4 样本 | 结论 |
|---|---|---|---|
| `turn/start` | 124 | 9 | ✅ 正常计数 |
| `user/message` | 654 | 31 | ✅ 正常计数 |
| `assistant/message` | 1047 | 159 | ✅ 正常计数 |
| `tool/call` | 921 | 183 | ✅ 正常计数 |
| `deliverables/presented` | 24 | —（该会话无） | ✅ |

**事件类型名一个未变**，`user/message` 的 payload 仍带 `source` 字段：

```text
31x  user/message (data) [content,id,role,source]        ← source 仍在
163x assistant/message (data.message) [message,step,stream,turn,usage]
```

#### 结论与教训

- **README 的 "renames message sources" 指内部归一化处理**，不是改动 `type` 事件名、也不是删除 `source` 字段。老解析器在 v4 上**照常工作**。
- ⚠️ **教训**：初稿仅凭 README 的**文字描述**就判定「会静默算错」，未做端到端实测。当测试成本极低时（当时本机已有 v4 文件），**应先测再判**。
- 因此下文的「影响面」评级需相应下调：**解析链路实际风险为「低-中」**，而非「高」。

### 2.3 仍需保留的警惕（未被证伪的部分）

虽然口径未破，但**格式版本号确实变了**（v3 → v4），且**没有任何东西保证将来不变**：

```
decodeFrames() 只扫 zstd 魔数，不认格式版本号
  → 它能"成功"解开任何版本的帧
  → 一旦将来某版真的改了事件名或字段结构，它会静默算错而非报错
```

**与既有的多-frame 坑同一模式**（见 `dsh-session-export.mjs` 头注释：「会得到'事件总数 1'的假象」——那次的根因也正是"解压成功但内容不全"）。

**因此「给解析器加格式版本校验」的建议依然成立**（见第六节）：读到非预期版本就**显式报错/告警**，把潜在的静默失效变成显式失败。这是低成本高收益的加固。

### 2.4 v3 文件不会被改写（已实测确认）

`v3-to-v4` README：

> Restore supported released V3 Sessions as V4 **without rewriting their stored generation**. …verified **exclusive successor publication**.

本机实测吻合：**65 个 v3 与 3 个 v4 并存**，v3 未被删除或原地改写。即升级不丢老数据，新会话另起 v4 文件。

`v3-to-v4` README：

> Restore supported released V3 Sessions as V4 **without rewriting their stored generation**. …verified **exclusive successor publication**.

即：**v3 文件保留不原地改写**，迁移另写 successor。所以升级后老数据仍可读，但**新会话写成 v4**（本机实测：65 个 v3 与 3 个 v4 并存）。

---

## 三、影响面清单（升级前必须逐项验证）

| 类 | 受影响对象 | 风险（实测后修订） |
|---|---|---|
| **解析链路** | `tools/dsh-session-export.mjs`(98)、`dsh-session-recap.mjs`(291)、`token-audit.mjs`（`.usage` 引 6 处）、`project-pack.mjs`、`server/app.mjs`(1486)、`packages/dsh-recap/lib/recap-core.mjs`、`packages/dsh-recap/plugins/recap-tool.mjs`、`web/flow.html` | 🟡 **低-中**（v3→v4 实测未破口径；但无版本校验兜底，见 §2.3） |
| 会话统计 API | `server/app.mjs` 工作台统计、token 口径 | 🟡 低-中（同上） |
| client-ui 注入 | `platform-ui` 声明 `dsh.client.inject=[dsh-client-ui-renderer, dsh-client-ui-sidebar]` | ✅ **低**（实测两版 `lib/index.js` 逐字节相同） |
| 自研 Cordis 插件 | `platform-skin`、`dsh-recap`（走公开 `ctx.tools.register`） | ✅ 低 |
| cordis 运行时 | `^4.0.2 → ~4.0.4`（同大版本） | ✅ 低 |

**合计约 1,930 行解析代码 / 8 个入口**（规模属实，但风险评级已按实测下调）。

---

## 四、升级流程

### 阶段 0：建立口径基线（**无需停机，但必须在升级前做**）

因为失效是静默的，"页面能打开"不是验收标准。唯一有效验收是**对数字**。

```
1. 对现有 23 个 v3 会话文件跑统计，落盘存档
   node tools/dsh-session-export.mjs <file>   # 逐个账号
   记录：事件数 / turn/start / user/message / assistant/message / tool/call
         / deliverables/presented / token usage

2. 存档位置建议：/opt/ai-platform/data/baseline-<日期>/

3. 该基线同时用于：升级后比对、以及将来任何格式变动的回归
```

> **这一阶段的产出本身就是资产**：它把「静默失效」变成「数字对不上」，无论升不升级都值得存在。

### 阶段 1：备份（停机窗口内）

```
1. 备份各账号 dsh-home
   ⚠️ 沙箱会静默丢弃 cp -R —— 必须逐文件拷，并核对文件数/字节数
   参考量：again 35M / qianzaoaiyin 70M / 其余 0–2.8M，合计约 116M

2. 备份 /usr/lib/node_modules/@deepseek-ai/dsh（全局包本体，用于回滚）

3. 验证备份：文件数、总字节数与源一致
```

### 阶段 2：副本验证（**不动全局**）

```
1. 在独立前缀装新版（不覆盖 /usr/lib）
   npm install --prefix /opt/ai-platform/.upgrade-test @deepseek-ai/dsh@<版本>

2. 用副本启动 again 实例（换端口，避免影响线上）
   让 agent 产生一条新对话

3. 检查新文件是 session.v3 还是 session.v4   ← 决定性问题
   ls <dsh-home>/sessions/*/*/session.v*.jsonl.zstd

4. 对数字：将新文件统计与阶段 0 基线比对
   任一数字对不上 → 解析器必须先改，再谈升级
```

### 阶段 3：切换或回滚

```
全过 → 切换全局版本 → 重启 7 个实例 → 复验
任一失败 → 回滚：还原全局包 + 还原 dsh-home 备份
```

### 阶段 4：升级后复验

```
1. 7 个账号能登录、能对话
2. 工作台会话统计与基线一致
3. platform-ui 侧边栏、skin 生效
4. token 口径（token-audit）与基线一致
```

---

## 五、验收标准（唯一有效的那条）

> **同一批会话文件，升级前后的统计数字必须逐个一致。**

其余都能看日志，**静默失效只能靠对数字**。任何一项不一致即视为升级失败。

---

## 六、当前建议：**不急，可择机升级**

> **本节结论已被实测修订。** 初稿基于"v4 会破坏统计口径"判「不要升级」；实测证伪后，代价显著低于初判，建议由「不要」调整为「不急」。

| 维度 | 结论 |
|---|---|
| 收获 | **基本为空，但非零**。待升 9 个版本（`0.1.5-rc.3` → `0.2.0-rc.2`）**全是 rc/alpha，无正式版**；新增 12 个包（plugin-manager、skill-office、workflow-ptc 等）本平台暂无需求 |
| 代价 | ~~1,930 行解析代码重写~~ → **实测降级**：v3→v4 未破统计口径（§2.2），解析代码**大概率无需重写**。实际代价＝备份 + 停机 + 一次复验 |
| 风险 | 🟡 **低-中**（不再判为「高」） |

**触发升级的条件**（满足其一再考虑）：
1. 0.2.0 转**正式版**；或
2. 出现必须在某个新版本才能解决的问题。

**无论升不升级，都建议先做的两件事**（这两条**不受本次更正影响**，依然成立）：
1. **建立阶段 0 的口径基线**——把「静默失效」变成「数字对不上」，成本低、独立有价值。
2. **给解析器加格式版本校验**：`decodeFrames()` 目前只认魔数、不认版本号。**本次 v4 恰好没改事件名是运气，不是保证**；加一个版本检查（读到非预期版本就显式告警/报错），把将来的静默失效变成显式失败。这是低成本高收益的加固。

---

## 七、附：既有问题（独立于升级，待处理）

| # | 问题 | 说明 |
|---|---|---|
| 1 | **口径漂移** | 线上实际写 `session.v3`，但 0.1.5-rc.2 的 README 只声明到 v2（靠 `dsh-session-format-v2-to-v3` 包支持）。**可能有别处也依据了错误的格式假设**，待排查 |
| 2 | **解析链路无版本防护** | 见六-2 |
| 3 | **本机双版本共存** | 全局 `dsh 0.1.5-rc.1`（`/Users/apple/.npm-global/bin/dsh`）与桌面端 `0.2.0-rc.2` 并存，将来会咬人 |

---

## 八、变更记录

| 日期 | 内容 |
|---|---|
| 2026-10-01 | 初稿。基于对线上 `0.1.5-rc.2` 与 npm 上 `0.2.0-rc.2` 的实测对比（含逐包 diff、格式谱系比对、线上会话文件普查）。**流程未执行。** |
