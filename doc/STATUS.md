# 状态总表（唯一入口）

> **用法**：想知道「现在到哪了」→ 只看本表。要改状态 → 先查 §2 触发清单，按它列的联动位置改，别只改一处。
> **规则**：每个状态项只在本表写**当前值**；其他文档要么写指针（「状态见 doc/STATUS.md」），要么只写与本文件主题相关的细节。**禁止多份完整副本**（副本必然漂移——本项目已经吃过大亏：README/ROADMAP/STATUS-MANIFEST/ENGINEERING_TODO 全部停在 9/06，实际已到 9/25）。
> **最后核对：2026-09-25**｜📊 一眼看状态：[`doc/status.html`](status.html)（由本表生成）

---

## 1. 状态总表

| # | 状态 | 状态项 | 当前值（2026-09-25） | 权威来源（唯一事实源） | 联动位置（改了要同步） |
|---|---|---|---|---|---|
| 1 | 🟡 | **代码主线** | 0.6.0 节点化重构：D1 ✅ D2 ✅ D3 ✅ D4 ✅ **D5 ✅** D6 设计初稿（待拍板）D7–D10 ⬜ | `doc/architecture/节点化迁移计划.md` §四-A 进度区 | ROADMAP 状态行、本表、决策日志（每期拍板） |
| 2 | ✅ | **线上判定引擎** | 前端判定调用已切 **`graphEngine`**（`review.js:204`，CI run #40 部署成功）；`judgeOne` 仍负责 `listQuestions`/`updateTranscription`/`reviseByNaturalLanguage`/`updateParams` | 代码 `miniprogram/packageDiagnose/pages/review/review.js`；`doc/architecture/判定域影子对比（D5）.md` §6.1 | 本表、决策日志、PROJECT-STRUCTURE |
| 3 | ✅ | **D5 影子对比结论** | **四层全 0 差异**：夹具 26 / 真模型 6 / 真题 55 / 云端同 raw 12 字段 | `doc/architecture/判定域影子对比（D5）.md` §7.1 | 迁移计划进度区、本表 |
| 4 | ✅ | **云函数** | 14 个：`diagnose` `dispute` `graphEngine` `graphService` `judgeOne` `knowledgeAdmin` `manageKnowledge` `photoUpload` `ragService` `reportService` `statService` `userLogin` `zhixueAuth` `zhixueSync` | `cloudfunctions/` 目录 | PROJECT-STRUCTURE、本表 |
| 5 | 🟡 | **部署通道** | 走 CI（miniprogram-ci，commit message 带 `[deploy]` / `[deploy:函数名]`）；**`tcb fn deploy` 不可用**（COS 上传 60s 超时 + 会把 runtime 改成 Nodejs20.19，违反决策 044） | `.github/workflows/deploy-wechat.yml`、`doc/standards/工程化与CI经验.md` | 经验文档、本表 |
| 6 | ✅ | **云端数据规模** | questions **61**（已判 55）/ batches **25**（photo 与 **zhixue** 两类）/ 用户 **2** / 报告 15 份（9/19 口径）/ 学生异议 **0** | 云数据库（`tcb db nosql execute`，环境 `cloud1-d8g0ty39wd73f430a`） | 审计文档 §1、本表 |
| 7 | ⚠️ | **判定质量** | 壳一致 ✅（0/55）；**稳定性仍未修**（P1 精细数值当精确分、P2 η 无钳制） | `doc/architecture/诊断质量审计-2026-09-19.md` | 本表、决策日志、掌握度链路-待办 |
| 8 | ⚠️ | **🆕 已废规则残留** | `RUBRIC_V2` 里的 `■ 5维锁定` 表 + 必填 `fiveDim`，是**决策 024「不给五维逐项打分」的残留**；且表用 1~5、决策 026 已定 0~1 → 库里 20/54 题五值全同、7 题整组作废 | 决策 024 / 026；`graphEngine/src/lib/prompts.js:21` | 待用户拍 a/b/c 后：prompt、D6 设计、审计 P5、本表 |
| 9 | ⚠️ | **审计 P1–P9** | 045 已修：对错口径统一 / 报告三态 / 五维越界作废 / 选填题字段守卫；**未修**：P1 展示改档位、P2 η 钳制、P3 043 判据落地、P5 errorLevel 兜底、历史 15 份报告是否重跑 | 审计文档 §3、决策 045 | 本表、决策日志 |
| 10 | ⚠️ | **知识图谱** | **269 节点** + 61 extras（8/17 治理后）；覆盖**仅必修一**（含第 0 章初高衔接） | `knowledge-graph/nodes/`；`doc/STATUS-MANIFEST.md` 图谱专项 | STATUS-MANIFEST、本表 |
| 11 | 🟡 | **评测资产** | 题面 **436 题**（`dataset-v2.json`）；合成痕迹 **43 条 / 11 题**（4 角色，剔除 quality 后 38 条可用）；人工断言 **10 条**；稳定性脚本 `scripts/eval-stability.mjs` | `output/golden/`（**gitignore，版权原因不入库**）、`doc/architecture/评测数据集预研.md` | 评测预研 §七/八、D6 设计、本表 |
| 12 | ✅ | **模型选型** | 转录 Qwen3.7-plus；判定主模型 `deepseek-v4-flash`（thinking disabled + temp 0.2）；GLM 作影子 AB | `doc/模型选型路由决策.md`、`cloudfunctions/*/index.js` 配置区 | 本表、ROADMAP 选型结论 |
| 13 | 🟡 | **流程门禁** | prd ✅ / arch ✅ / detailed ✅ / review ✅ / **code 未完成**（流程遗留）；理解确认 ✅（9/19） | `bash gate.sh status` | GATE_SUMMARY、本表 |
| 14 | ✅ | **工程版本线** | 0.5.x = 线上 beta（9/1 校内起）；**0.6.0 = D1–D10 全完成**；0.7.0 = 复盘 Q/S；1.0 需审批（长期不做） | `doc/architecture/节点化迁移计划.md` §版本线 | 本表、决策日志 |
| 15 | ⚠️ | **真实使用规模** | 2 个账号（1 个是作者本人）→ 「对某个学生有用」**缺证据** | 审计文档 §1 | 本表 |
| 16 | ⚠️ | **版权数据风险** | `output/golden/_src/`、`dataset-*.json` 已正确忽略；**但 3 个 golden 文件已被 git 跟踪**（含 `2025新高考I卷-数学-题面+解析.txt`）→ 与「版权内容不进 public 仓库」冲突，**待决定是否清理** | 本表 §1-16；`.gitignore` | 待拍板后：`.gitignore` + `git rm --cached` 或 filter-repo |
| 17 | ✅ | **凭据与登录** | 腾讯云 API 密钥对在 `~/.zsh_history`（**仓库内无泄露**，已扫）；`tcb login --apiKeyId/--apiKey` 已可用；**本机无微信私钥** → 云函数部署只能走 CI 或开发者工具 | `doc/standards/开发经验.md` §五-12 | 经验文档、本表 |
| 18 | ✅ | **D6 基线（旧版稳定性）** | 三态一致率 **91.4%**、level 一致率 **85.7%**、errorLevel **77.1%**、知识点名 **60.0%**、题型 pattern **22.9%**、不稳定用例 **8/35**、解析失败 **3/38** | `output/golden/results/stability-old.json`、D6 设计 §5.1 | D6 设计、本表 |
| 19 | 🟡 | ** 图谱质量 / 方法区分治** | 271 节点里 `type=method` **89 个（33%）**，按决策 028 的 WWH 不该作知识节点 → **已给这 89 个打 `partition:'method'`**（纯新增字段，`nModified:89` 已复核）；**两个引擎的「清单过滤」已改**（`judgeOne:108`、`graphEngine/lib/knowledgeMatch.js:33`，47/47 测试过）→ **待部署才生效**；回退：`node scripts/partition-method-nodes.mjs --revert` | 云端 `knowledge_nodes`；`scripts/partition-method-nodes.mjs` | 剩余：① 部署生效 ② 图谱前端分区展示 ③ 5 道历史题的主知识点是否迁父节点 |

---

## 2. 触发清单（改了什么 → 必须同步哪些）

| 你做了什么 | 必须更新 |
|---|---|
| **完成一期节点化（Dn）** | ① `节点化迁移计划.md` 进度区 ② 本表 #1 ③ `ROADMAP.md` 状态行 ④ 有拍板则追加 `decision-log.md` ⑤ 本表「最后核对」 |
| **改判定口径 / 阈值 / prompt** | ① `decision-log.md` 新决策 ② 本表 #7/#8 ③ 审计文档对应 Pn 状态 ④ **D5 有意修正清单**（若改了行为）⑤ D6 设计（若在拆分范围内） |
| **改云函数并部署** | ① 本表 #2/#4/#5 ② `PROJECT-STRUCTURE.md`（新增/删除函数时）③ 提交信息带 `[deploy:函数名]` |
| **小程序增删页面** | ① `PROJECT-STRUCTURE.md` §二 ② 本表 #2（若影响判定入口） |
| **图谱数据变更** | ① `STATUS-MANIFEST.md` 图谱专项 ② 本表 #10 |
| **新增评测语料 / 改评测脚本** | ① `评测数据集预研.md` §七/八 ② 本表 #11 ③ D6 设计的评测方案 |
| **阶段门禁变化** | ① 以 `bash gate.sh status` 为准 ② 本表 #13 |
| **每轮对话收尾** | ① git 提交（新建文档先问「是否进 public 仓库」）② 本表「最后核对」日期 |
| **改了本表任何一行** | 重跑 `node scripts/render-status.mjs` 生成 `doc/status.html`（看板由本表派生，**不要手改 status.html**） |

---

## 3. 已作废/易错的状态写法（别再犯）

| 反例 | 为什么错 |
|---|---|
| 每个文档各写一份「当前状态」段落 | 副本必然漂移 —— 2026-09 实测：4 份文档同时停在 9/06，而代码已到 9/25 |
| 用「设计定稿/正在讨论」描述已完成的期 | 无法判断真实进度 → 本表只写 ✅/🟡/⬜ + 日期 |
| 把「跑通了」当成「质量达标」 | D5 壳一致 ≠ 判定准；审计 P1/P2 仍在 |
| 忘了 `source` 分组 | `photo`（AI 判）与 `zhixue`（官方口径）混统计会得出假结论（9/25 实测踩过） |

> 更新日志：2026-09-25 建立（首次把 7 个文件里的状态收敛到本表 + 6 份滞后文档对齐）。