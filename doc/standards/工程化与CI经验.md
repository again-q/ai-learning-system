# 工程化与 CI 经验（GitHub Actions / 微信上传 / 本机环境）

> **文件分工**（2026-09-12 按用户要求划定）：
> - 本文件 = **工程化与环境类**经验（CI、部署、依赖、沙箱、工具链）
> - `../decision-log.md` = **只记产品关键决策**（功能形态、口径、版本线）
> - `./开发经验.md` = 项目本身的开发经验（前端/判定管线/页面跳转等）

---

## 一、工程决策 E1：无电脑迭代通道 = GitHub Actions 自动上传（2026-09-12）

| 字段 | 内容 |
|------|------|
| **时间** | 2026-09-12 |
| **状态** | ✅ 已定（用户拍板「1、4 都做，4 为主路径」） |
| **背景** | 目标：手边没电脑时也能迭代——手机云 Agent 改码 → 提交 GitHub → 自动上传微信 → 手机立刻看效果。核实：`miniprogram-ci` 只能 `upload`（生成**开发版**）和 `preview`（**预览二维码**）；「上传代码并生成体验版」属**第三方平台（服务商）API**，需开放平台 300 元认证 + 官网 + 小程序授权 + 模板库流程，个人主体不走；手机端官方「开发者助手」文档能力仅版本查看/成员管理/基础数据/性能分析，**无**设为体验版/提交审核/发布 |
| **拍板** | ①**主路径（4）**：CI `upload` → 微信后台出现新「开发版」→ 手机「开发者助手」→ 版本查看 → 开发版 → 直接打开；②**辅助通道（1）**：`preview` 二维码推到 `ci-preview` 分支，经 jsDelivr 在 Actions 运行摘要 + 固定通知 issue 中显示图片 → 手机长按存相册 → 微信「扫一扫 → 相册」进预览版（二维码**短时效，拿到就扫**）；③体验版/发布**不做自动化**，学生侧仍由人工在公众平台点一次「选为体验版」 |
| **范围** | 新增 `.github/`（workflow + CI 脚本 4 个），**不改**小程序业务代码；CI 依赖隔离在 `.github/ci`（精确锁 `miniprogram-ci@2.1.31`，不提交 lockfile）；云函数部署默认关闭（仓库变量 `ENABLE_CLOUD_FUNCTIONS=true` 后生效），白名单 = 10 个小函数（judgeOne/reportService/ragService/statService/dispute/graphService/userLogin/knowledgeAdmin/manageKnowledge/photoUpload），`graphEngine`(193M)/`diagnose`(41M) 因仓库内带 node_modules 排除 |
| **前提** | 微信公众平台生成「代码上传密钥」→ GitHub Secret `WECHAT_PRIVATE_KEY`；**该页 IP 白名单必须关闭**（GitHub 托管 runner 出口 IP 不固定） |
| **联动** | 见本文件「二、4 个坑」；嫌通知频繁时给二维码 4 个 step 加 `if: github.event_name == 'workflow_dispatch'` 即可改回手动触发 |

---

## 二、落地的 4 个坑（2026-09-12）

- **坑 1｜npm 缓存 EPERM**：`npm install` 报 `EPERM open /Users/apple/.npm/_cacache/tmp/...`，npm 提示的 "root-owned files" 是**误导**——真因是 `~/.npm` 在工作区外，被沙箱拒绝写入。**修**：`npm install --cache /tmp/<dir>`。
- **坑 2｜npmjs 直连过慢**：`curl registry.npmjs.org` ≈5.9s/请求，装 miniprogram-ci（1103 包）8 分钟仍无 node_modules；`registry.npmmirror.com` ≈0.73s/请求，3 分钟装完。**修**：本地验证用 mirror；**但不提交 mirror 生成的 lockfile**（resolved 指向 mirror，而 CI runner 在美国用 npmjs 更快）→ workflow 用 `npm install` + package.json 精确锁 `miniprogram-ci: 2.1.31`，不用 `npm ci`。
- **坑 3｜miniprogram-ci 20002**：`generate local signature fail ... DECODER routines::unsupported` = 私钥内容/编码不对。注意 `project.attr()` 也会**先用私钥本地签名**，所以没有真密钥无法本地冒烟（只能验证到签名这一步）；密钥若以字面 `\n` 存储（GitHub Secret 常见）必须 `replace(/\\n/g,'\n')` 还原。
- **坑 4｜macOS 没有 `timeout`**：探测远端鉴权写成 `timeout 25 git ls-remote ...` 报 `command not found`；替代：`GIT_SSH_COMMAND='ssh -o BatchMode=yes -o ConnectTimeout=15' git ls-remote origin -h refs/heads/main`（本机已实测通过，说明这台机器有 push 权限）。

### 附：miniprogram-ci 能力边界（官方文档核实）
`miniprogram-ci` 只有 `upload`（→开发版）/ `preview`（→二维码）/ `cloud.uploadFunction`（云函数，同一把上传密钥）/ `packNpm`，**没有**设为体验版/提交审核/发布；「上传代码并生成体验版」是**第三方平台（服务商）API**（需 300 元开发者资质认证 + 官网 + 授权 + 模板库流程）→ 个人主体不走。

---

## 三、流程复盘：单轮 turn 成本与可优化点（2026-09-12）

- **量级（DSH 会话日志实测，代理指标）**：8 turn / 63 step / 55 次工具调用；各步上下文**重复处理量合计 ≈ 7,900 万字符**，**单步均值 ≈ 125 万字符**；我的输出（含 reasoning）≈ 28 万字符；日志解压后 2.24M 字符。
- **钱（粗估，非账单）**：deepseek-flash 官方定价（2026-09 抓取）输入缓存命中 0.003–0.006 美元/M、未命中 0.15–0.30 美元/M、输出 0.6–1.2 美元/M → 单轮约 **0.3–4.8 美元（¥2–35）**，缓存命中率越高越靠下限。**DSH 本地不记录 usage**（session 日志无 token 字段，~/.dsh 与 DSH 源码均无），**精确数只能看 DeepSeek 平台用量页**；估算需解压 `session.v3.jsonl.zstd`（多帧，必须 `zstd -dc`，node `zstdDecompressSync` 只解第一帧）。
- **核心结论：成本第一驱动是「步数 × 每步上下文」，不是输出长度。** 63 步 × 平均 125 万字符 = 主要开销；要砍成本，砍步数远比砍输出有效。
- **可优化点（按收益排序）**：
  1. **同一页面重复抓**：微信 ci 文档抓了 3 次，每次约 10 万字符重新灌回上下文 → 第一次抓到就落盘（/tmp），后续用本地 grep 取片段。
  2. **后台 job 轮询**：npm install 我 wait 了 3 次都返回 running → 一次性长 wait；启动前先探连通性。
  3. **探测命令合并**：能并成 1 次 bash 的绝不拆 5 次（本轮后半程才做到，前半程多次单条探测）。
  4. **搜索空摘要连试**：web_search 无摘要时连试 3 组措辞 → 第二次无摘要就转 web_fetch 官方文档。
  5. **长问卷**：ask_user_question 塞长摘要被用户取消，白烧一轮 → 短问，或理解一致直接干。
  6. **同一方案输出 3 遍长文**（方案 → 体验版修订 → 二维码通道）→ 第一遍就落 doc，后续引用。
  7. **装依赖前先探两件事**：registry 延迟（一行 curl）+ cache 可写性（npm config get cache），避免 8 分钟空等（见坑 1/2）。
  8. **工具契约先读**：edit 前必须先用 read 工具读文件；**用 bash（sed 等）改过的文件，edit 前必须重新 read**（观测快照会失效，本轮各被拒 1 次）。
- **保留的好做法**：只读调用并行（Promise.all）批量探测；失败后先读报错原文再换路（EPERM→mirror、20002→密钥编码都是这么定位的）；结论沉淀进 git 跟踪的文档而非 AI 私有记忆。
