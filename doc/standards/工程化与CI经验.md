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

### 附：代码上传密钥实测结论（2026-09-13）
- 微信公众平台下载的密钥是 **PKCS#1 PEM**：首尾行为 `-----BEGIN RSA PRIVATE KEY-----` / `-----END RSA PRIVATE KEY-----`，**2048 位、LF 换行**（不是 PKCS#8 的 `BEGIN PRIVATE KEY`，也不带 CRLF）。
- 不泄露内容的校验三步：① `openssl rsa -in <key> -noout -check` → `RSA key ok`；② `node -e "crypto.createPrivateKey(fs.readFileSync(p))"` 能加载（**最关键：miniprogram-ci 走的就是它，能加载就不会报 20002**）；③ `shasum -a 256` 比对文件一致性。
- 填 GitHub Secret 的最佳姿势：`pbcopy < <key文件>` 把全文放进剪贴板 → 浏览器 Secret 框 `Cmd+V`，**避免手抄/截断导致 20002**。
- 首次 push 到 main 会**自动触发一次运行**；若那一刻 Secret 还没配好，这次运行必红（Secret 在任务开始时就已读取）——配好后用该运行的 **Re-run all jobs** 即可，不用改代码。
- 本机没有 `gh` CLI、环境里也没有 GitHub token → **无法用 API 触发 workflow_dispatch**；要触发运行只能走 `git push`（本机 SSH 已可 push）。

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

---

## 四、收尾状态：未验证项（2026-09-12 当日收工，下次从这里接）

- **已完成**：方案 + 5 个 CI 文件（本地 commit `cb76107`）+ 文档（本文件、`开发经验.md` 分工、`coding-rules.md` 收尾铁律）
- **未推送**：6 个 commit 仍在本地，远端 `origin/main` 还是 `0a7048e`
- **⚠️ 未验证（关键）**：**真实上传到微信一次都没跑过**（GitHub Actions 运行数 = 0）。缺两样输入：①微信公众平台「代码上传密钥」→ GitHub Secret `WECHAT_PRIVATE_KEY`；②该页 **IP 白名单必须关闭**
- **下次第一步**：用户给密钥（放本机、勿贴聊天）→ push → 手机 `Actions → 部署到微信 → Run workflow` → 验「开发者助手里开发版已刷新」+「📱 最新预览二维码 issue 出现二维码」
- **Step 2/3 未开始**：云函数开关默认关（仓库变量 `ENABLE_CLOUD_FUNCTIONS` 未设），Step 1 只跑前端包 + 二维码
- **已归档结论**：`miniprogram-ci` 无体验版/发布能力（服务商 API 门槛 300 元认证 + 官网），学生侧仍需人工点一次「选为体验版」

---

## 五、本机出网边界：境内外分裂（2026-09-13 实测，查资料类任务必读）

一次查"成熟平台知识点识别"的任务里 `web_fetch` 失败 7 次，实测归类后是**两个根因 + 一个工具策略**，不是"网络不稳定"：

| 现象 | 次数 | 实测证据 | 性质 |
|---|---|---|---|
| `TypeError: fetch failed` | 4（arxiv.org ×2、export.arxiv.org、patents.google.com ×2） | `curl https://arxiv.org` → **exit 35 `Recv failure: Connection reset by peer`**（443 握手被重置）；`http://arxiv.org` → **exit 28 超时**；patents.google.com connect 阶段即失败；**DNS 全部正常解析** | **境外出网被阻断**（运营商/GFW 级，非 DNS、非代理配置）——同一根因 |
| `HTTP 403`（WAF 页） | 2（applejia、vivozhijia） | 同一篇文章的转载农场站点，非浏览器请求一律拦 | 站点反爬，**重试不会变**（另一根因） |
| `cross-origin redirect ... not followed` | 1（17golang） | 工具不跟随跨域跳转 | 工具策略，**换最终 URL 重试一次即可**（当时反而没试） |
| 对照组：国内站通 | — | `curl https://www.kuizhuokj.cn` → **exit 0**；同一个域名 `web_fetch` → HTTP 200 | 不是"网全断"，是**按目的地分裂** |

**教训（执行侧）**：
1. **第 1 次 `fetch failed` 就探一次出网**（`curl -sS -m 8 -o /dev/null <url>` 看 exit code），别连试第二个域名 —— 本轮 7 次失败**一次探测都没做**，白白浪费 4 次调用。
2. **同一被墙主机的换 URL 重试 = 假换路**（patents `/en` 失败后又试 `/zh`），违反"失败换路不原样重试"。
3. **该换路的没换**：跨域重定向那条只需换成最终 URL，成本最低却放弃了。
4. **默认策略**：境外域名（arxiv / Google Patents / 多数 .com 学术站）**视为不可达**；需要内容时走 ① `web_search` 摘要（本轮专利原文关键句就是摘要给的）② 国内可达站 ③ 国内转载镜像。**不要**再拿 fetch 去撞。
5. 影响可控的前提：**结论不吃失败来源** —— 本轮核心证据来自 HTTP 200 的国内站 + 搜索摘要，arXiv 仅作旁证并已标注"只拿到标题"。查资料时优先选能拿到的证据，而不是先列理想来源清单。
