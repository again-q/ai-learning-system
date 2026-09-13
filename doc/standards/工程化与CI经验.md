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

## 二、落地的 5 个坑（2026-09-12 ~ 09-13）

- **坑 1｜npm 缓存 EPERM**：`npm install` 报 `EPERM open /Users/apple/.npm/_cacache/tmp/...`，npm 提示的 "root-owned files" 是**误导**——真因是 `~/.npm` 在工作区外，被沙箱拒绝写入。**修**：`npm install --cache /tmp/<dir>`。
- **坑 2｜npmjs 直连过慢**：`curl registry.npmjs.org` ≈5.9s/请求，装 miniprogram-ci（1103 包）8 分钟仍无 node_modules；`registry.npmmirror.com` ≈0.73s/请求，3 分钟装完。**修**：本地验证用 mirror；**但不提交 mirror 生成的 lockfile**（resolved 指向 mirror，而 CI runner 在美国用 npmjs 更快）→ workflow 用 `npm install` + package.json 精确锁 `miniprogram-ci: 2.1.31`，不用 `npm ci`。
- **坑 3｜miniprogram-ci 20002**：`generate local signature fail ... DECODER routines::unsupported` = 私钥内容/编码不对。注意 `project.attr()` 也会**先用私钥本地签名**，所以没有真密钥无法本地冒烟（只能验证到签名这一步）；密钥若以字面 `\n` 存储（GitHub Secret 常见）必须 `replace(/\\n/g,'\n')` 还原。
- **坑 4｜macOS 没有 `timeout`**：探测远端鉴权写成 `timeout 25 git ls-remote ...` 报 `command not found`；替代：`GIT_SSH_COMMAND='ssh -o BatchMode=yes -o ConnectTimeout=15' git ls-remote origin -h refs/heads/main`（本机已实测通过，说明这台机器有 push 权限）。

- **坑 5｜20003 `invalid ip` = IP 白名单开着（2026-09-13 第一次真跑撞上）**：上传请求被微信拒：`{"errCode":-10008,"errMsg":"invalid ip: 112.51.227.113"}`。本机与 GitHub runner 的出口 IP 都不在白名单里 → **「小程序代码上传」页的 IP 白名单必须关闭**（托管 runner 出口 IP 不固定，加白名单没意义）。附带实测：本项目打包后 zip = **1,798,520 B（≈1.7MB，未超主包 2MB）**；一次 upload 会逐文件打印约 **600 条**编译进度 → CI 日志很吵（后续可给 `onProgressUpdate` 加节流）。

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
  9. **锚点三查**（2026-09-13 一次回合踩了 3 次同类）：① **唯一性**——同一行可能在文件里出现多次（`REPO: ${{ github.repository }}` 就有 2 处）→ 锚点要带上下文；② **真实性**——别凭记忆写缩进（写成 `    "$TCB"` 而文件里是 `  if ! "$TCB"`）→ 锚点只取"刚 read 到的原文片段"；③ **少堆复杂 grep 转义**（`grep -o"...\{300\}"` 直接报 invalid repetition count）→ 用 python/node 读文件定位更稳。
  10. **bash 内联脚本少用 heredoc + 正则替换混写**：本轮把 `replace('\n',' ')` 塞进 heredoc 里直接 SyntaxError；复杂处理写进 .py/.sh 文件再跑，别在命令行里拼。
- **保留的好做法**：只读调用并行（Promise.all）批量探测；失败后先读报错原文再换路（EPERM→mirror、20002→密钥编码都是这么定位的）；结论沉淀进 git 跟踪的文档而非 AI 私有记忆。
- **2026-09-13 收尾复测（同一会话，含真跑调试）**：15 turn / **122 step** / 107 次工具调用；上下文重复处理量 **≈ 2.65 亿字符**，单步均值 **≈ 217 万字符**（比 09-12 翻倍——上下文越长每步越贵）；输出（含 reasoning）≈ 50 万字符。粗估输入处理 ≈ 1.06 亿 token、输出 ≈ 20 万 token → 按 deepseek-flash 价约 **1–16 美元（¥7–115）**，缓存命中率越高越靠下限。
- **本次调试的关键技法**：CI 日志需要 admin 权限拿不到时（公开仓库 403），**用同一把密钥在本机跑同一条命令复现**——本机复现出完全相同的 `20003 invalid ip`，一步把"CI 环境问题"缩小为"IP 白名单问题"。

---

## 四、收尾状态（2026-09-13 · Step 1 已跑通并经用户实测验收）

- **Step 1 端到端 ✅（用户已验收）**：两条通道都人工验过——**副路径（预览二维码）可用**、**主路径（开发者助手 → 开发版）可用**
- **运行记录（4 次）**：`34744594441`（Secret 未配 → 预期红）→ `34744709271`（**根因 = IP 白名单**，见坑 5）→ `34745339020`（**85 秒全绿**）→ `34745497146`（修 `.jpg`/改 SHA 取图后全绿）
- **产物**：微信后台新增开发版（版本 `0.0.<run_number>`，备注带 commit 短号）；issue **#16「📱 最新预览二维码」**（每次运行自动更新）；分支 `ci-preview` 存最新二维码 `qrcode-<run>.jpg`
- **已验证**：CI 装依赖 ✅；上传鉴权 ✅（关闭 IP 白名单后）；jsDelivr 取图 HTTP 200 / `image/jpeg` / 470×470 ✅；GitHub camo 正常代理渲染 ✅
- **已知小现象（未定位，不阻塞）**：首次进「开发者助手 → 开发版」提示**已过期**，重进后正常 —— 疑似旧开发版条目的临时凭证失效；副路径预览二维码始终可用
- **可选优化（未做）**：给 workflow 加 `paths-ignore: ['doc/**', '**/*.md']`，避免纯文档提交也触发一次上传（现在每次 push 都会多一个开发版）
- **下次待办（Step 2）**：仓库变量 `ENABLE_CLOUD_FUNCTIONS=true` 后先只传 `judgeOne` 验证，同时实测上传云函数是否保留 `reportService/config.json` 的 timeout/内存与环境变量；Step 3 再开全白名单

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

---

## 六、云函数部署：改用 CloudBase CLI（tcb）+ 前缀门控（2026-09-13）

**决策**：云函数不走 miniprogram-ci 的 `cloud.uploadFunction`，改用用户习惯的 **CloudBase CLI（tcb）**；原 `.github/ci/upload-functions.cjs` 已删除。

**CI 命令（先查 CLI help 确认过参数）**
```bash
npm install --no-save --no-audit --no-fund @cloudbase/cli@3.8.0   # 只在需要部署时才装，不拖慢日常 push
tcb login --apiKeyId "$TCB_SECRET_ID" --apiKey "$TCB_SECRET_KEY"  # ⚠️ 是 --apiKey，不是 --apiKeyKey
tcb fn deploy <name> --force --install-dependency true -e <envId> --dir cloudfunctions/<name>
```
凭据 = **腾讯云 API 密钥**（SecretID/SecretKey）→ GitHub Secrets `TCB_SECRET_ID` / `TCB_SECRET_KEY`（建议 CAM 子账号最小授权）。云环境 ID = `cloud1-d8g0ty39wd73f430a`。

**前缀门控**：commit message **含 `[deploy]`**（或手动 workflow_dispatch）才跑云函数部署；日常提交仍只上传开发版 + 生成二维码（保证手机随时能看效果）。换前缀改两处 `if:`；想让"上传开发版"也受前缀控制，给前面几个步骤加同样的 `if:`。

**风险与依据（读 CLI 打包产物 `dist/standalone/cli.js` 得到）**
- `envVariables` 只在配置里**显式写且非空**时才进请求（`if (envVariables && Object.keys(envVariables).length > 0)`）→ **不会清空云端已配的环境变量**（我们的 QWEN_API_KEY 等只配在控制台，仓库里没有任何 envVariables 配置）。
- `fn deploy` 的**创建**路径会写 `DEFAULT_TIMEOUT` / `DEFAULT_MEMORY_SIZE`；**更新**路径是 `options.timeout && {Timeout}` 这种「显式才写」的形式 → 已存在的函数走更新路径。
- **未实测（下次带 `[deploy]` 的真跑必须核对）**：① `reportService` 的 900s/512MB 与环境变量是否原样保留；② 只传代码 + `--install-dependency true` 云端装依赖是否够（`wx-server-sdk`）；③ 第一次只部署 `judgeOne`。
- **2026-09-13 首次 `[deploy]` 真跑：失败（根因待定）**。观测手段受限（GitHub API 匿名调用被限流、日志需 admin），用**状态徽章**判断：`https://github.com/again-q/ai-learning-system/actions/workflows/deploy-wechat.yml/badge.svg` → 由 `passing` 变 `failing`；issue #16 已更新到「第 8 次（f92d0ca）」→ 说明**步骤 1–9 全过，失败发生在新加的两步**（安装 CloudBase CLI / tcb 部署）。已加"缺 Secret 时给明确报错"的守卫，待确认是 Secret 未配还是 tcb 本身报错。**技法：API 限流时用 badge.svg 看最新运行状态（不走 API）。**
- **首次 `[deploy]` 真跑的报错原文（2026-09-13，用户截图）**：`tcb login` 处 —— 「✖ 腾讯云密钥验证失败。检查密钥是否正确或终端网络是否可用。」。tcb 这个报错**不区分**「没配 Secret / 名字写错 / 值粘错 / 密钥属于别的账号」，故已在 workflow 加护栏：① Secret 为空时先给明确报错 ② 去空白（防粘贴多空格/换行）③ 只打印 `SecretId` 长度+末4位（不泄露密钥）④ 登录失败时输出 4 条排查提示。本地快速验证密钥的办法：`.\.github/ci/node_modules/.bin/tcb login -k`（交互式输入，不进 shell 历史）。
- **坑 7｜`tcb fn deploy` 在"函数已存在"时弹交互式选择，CI 必挂（2026-09-13 实测）**：日志会走到 `✓ Function exists, will update with the following merged config` 然后 `? Please select an action (Use arrow keys)`（选项：Update with merged config / Enter config manually / Exit）→ GitHub runner 无 TTY，进程退出 1。**试过但没用**：`--force`、`--json` 都挡不住（源码里 `options.yes || options.json` 那处判断属于另一条分支，别照搬）。**当前修法**：命令改成 `--force --yes --json ...` 并用 `printf '\n' | script -qec "<cmd>" /dev/null` 分配一个 PTY 再把回车喂给弹窗（Ubuntu runner 自带 util-linux 的 `script`）。
- **坑 8｜`if:` 匹配前缀要少写右括号**：`contains(msg, '[deploy]')` 匹配不上 `[deploy:judgeOne]`（中间多了冒号）→ 必须写 `contains(msg, '[deploy')` 才能同时兼容两种写法。
- **新能力**：commit message 支持 `[deploy:函数名,函数名]` 显式指定要部署的函数（优先于 git diff 推断），方便只测一个函数。
- **本机测试的前提**：本机没有 tcb 登录态时，任何 `tcb` 命令都会弹设备码授权（浏览器打开链接）→ 想本地验证先 `tcb login -k` 登录。
- **坑 9｜运行长期"排队/queued"**（2026-09-13 实测 #14 排了 18 分钟）：先在官方状态页确认是不是 GitHub 自己的问题 —— `https://www.githubstatus.com/api/v2/status.json`（当时返回 **Partial System Outage**）、`/components.json`（**Actions: degraded_performance**）、`/incidents/unresolved.json`（有 investigating 事件）。**别先怀疑自己的 workflow**。附带实测：`concurrency.cancel-in-progress: true` **不会**取消已排队（queued）的运行；排队是 GitHub 分配不出 runner，任何 workflow 设置都治不了。
- **本机查 GitHub 的两个硬事实（09-13 实测）**：① `github.com` 直连超时 → 访问网页/HTML 必须 `export https_proxy=http://127.0.0.1:7890`；② 走这个代理出口 IP 不同 → **能绕开 GitHub API 的匿名限流**（匿名 60 次/小时按 IP 计），查运行状态时非常有用。
- **坑 10｜`--yes` 有效 + 默认 COS 直传 60 秒超时（2026-09-13 本机实测）**：
  - ✅ `--yes` **确实压住了**那个 "Please select an action" 菜单（本机带 `--yes` 跑时直接进入部署，没再弹菜单）→ CI 的修法方向正确；
  - ❌ 紧接着报：`⠏ 云函数部署中...[judgeOne] 部署方式: COS 上传` → `✖ [judgeOne] COS 上传超时（60秒）` —— 默认走"签名 URL 直传 COS"，60 秒上限；
  - **修法**：加 `--deployMode zip`（CLI help 里的参数：cos / zip / image，默认自动）→ 直接 ZIP 上传，绕开 COS 直传。我们的小函数只有 64K~128K，zip 完全够用；
  - **诱因推测**：本机/CI 的出口若被代理绕道（本机 iKuuu、runner 在美国），直传腾讯云 COS 就要跨境往返 → 60 秒超时；zip 模式走 API 上传更稳。
