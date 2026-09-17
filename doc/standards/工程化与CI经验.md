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
- **⚠️ 最终结论（2026-09-13 定案）：云函数部署改回 miniprogram-ci 的 `ci.cloud.uploadFunction`。** 三道坎实测如下：
  | 尝试 | 结果 |
  |---|---|
  | `tcb fn deploy`（默认 COS 直传） | ❌ `COS 上传超时（60秒）` —— CLI 里 60 秒是**写死的** `setTimeout(..., 60000)`，不可配；本机（福州）与 CI（美国）跨境上传都超时 |
  | `tcb fn deploy --deployMode zip` | ❌ `ZipFile 上传不能大于 1.5MB` —— zip 模式会把**依赖一起打包**（源码本身才 64K），源码里 `MAX_ZIP_SIZE = 1.5*1024*1024` 写死；`--install-dependency` 大小写都试过无效 |
  | `tcb fn deploy --yes` | ✅ 有效（压住"请选择操作"菜单），但前两条堵死 → 无意义 |
  | **`ci.cloud.uploadFunction`** | ✅✅ **本机实跑通过**：`{"filesCount":3,"packSize":20236}`，云端装依赖，`Updating → Active`，且 1.7MB 的小程序包上传早已在 CI 验证过 → 跨境不是问题 |
  **最终实现**：`.github/ci/upload-functions.cjs`（每个函数一次调用）+ `.github/ci/deploy-functions.sh`（门控/只部署改动过的/失败自动贴 issue）。**不再需要 `TCB_SECRET_ID` / `TCB_SECRET_KEY`**（可留可删），云函数与小程序共用 `WECHAT_PRIVATE_KEY`。

---

## 八、收尾：全链路验证完成 + 本轮代价（2026-09-13）

- **CI 端到端 ✅**：运行 **#18（`1ccc110`）全绿** —— 步骤 9（运行摘要/更新 issue）与**步骤 10（部署云函数 miniprogram-ci uploadFunction）均 success**；小程序包/二维码此前已由 #13/#16 验证 → **手机 push 一步即可同时更新小程序与云函数**
- **云函数最终定案**：`ci.cloud.uploadFunction`（与小程序共用 `WECHAT_PRIVATE_KEY`、`remoteNpmInstall: true` 云端装依赖、不走 COS）；**本机 + CI 双重验证**
- **坑 11｜退出码陷阱**：miniprogram-ci 上传成功后**残留句柄导致 node 不退出** → 被脚本里 `timeout 300` 杀掉 → **明明部署成功却报红**（#17）。解法：成功/失败分支都显式 `process.exit(0/1)`。**排查要点：日志里最后一句是成功，但步骤是红的 → 先怀疑进程没退出**
- **本轮代价（同一会话累计）**：30 turn / 223 step / 193 次工具调用；上下文重复处理量 ≈ **9.85 亿字符**（单步均值 ≈ 442 万字符，随上下文变长而急剧上升）；输出 ≈ 92 万字符 → 粗估输入 ≈ 3.9 亿 token、输出 ≈ 37 万 token，按 deepseek-flash 价约**十几美元量级**，精确值看平台用量页
- **待办（可选）**：① workflow 加 `paths-ignore`，纯文档提交不上传；② 删掉不再需要的 `TCB_SECRET_ID`/`TCB_SECRET_KEY`；③ 清掉故障期遗留的 queued 运行 #14/#15

---

## 九、手机链路自启守护：launchd 与受限沙箱（2026-09-13）

**链路实貌（用 `pgrep -lf node` + daemon 日志反推，未改任何代码）**
```
手机 App(设备 7h-2c3fJ…) → 云中继 wss://pocket.ark-nexus.cc → cc-pocket-daemon
   → ACP(~/.dsh/profiles/acp) → dsh web (node, 127.0.0.1:3080) → 会话 54c2e76a
```
**关键发现：daemon 只「挂靠」不「拉起」。** 日志 `SessionRegistry - open <session> → reattach`、`Convo - acked prompt → agent (firstSpawn=false relaunch=false)` 证明 daemon 只寻找已存在的 agent。而唯一在跑的 agent 是**手动在 Terminal(ttys000) 起的 `dsh web`**（launchd 侧只有 daemon 有守护）。→ **睡眠能扛、重启扛不住**：`dsh web` 自 09-11 21:04 起跨过 **64 次睡眠/68 次唤醒**仍存活（睡眠是挂起不是退出），但重启/关机后无人拉起它 → 手机连上却没有 agent。

- **坑 12｜受限沙箱下 `dsh <profile>` 连 `--help` 都跑不起来（EPERM）**：`dsh web --help` 报 `EPERM: operation not permitted, open '/Users/apple/.dsh/profiles/web/cordis.yml'`（栈顶 `prepareProfile → writeFileSync`）。**根因**：dsh 启动时**先重写 profile 的 `cordis.yml` 再解析 app 参数**，而 `~/.dsh` 在工作区外、被 workspace-write 沙箱拒绝。**教训**：`dsh web --help` 不是纯读操作，别拿它当无害探测；同理 `--dump-config` 之外任何 boot 动作都会写 `~/.dsh`。
- **坑 13｜写工作区外文件必须一次性申请 `danger-full-access`**：`~/.local/bin/xxx: Operation not permitted` + `[sandbox: file access denied under workspace-write mode]`。**修**：同一条命令原样重试 + `sandbox_permissions: danger-full-access` 并在 `justification` 里说明「该路径由 launchd 约定，无法放进工作区」。**注意**：用户可能**拒绝**该申请（本会话第一次申请自启脚本就被拒）——被拒是终局，不得绕过，应改为给出可粘贴命令。
- **坑 14｜`launchctl bootstrap/load` 在受限上下文一律 `EIO(5)`，且伪装成"配置错误"**：`Bootstrap failed: 5: Input/output error`，`launchctl load -w` 同样。**排除法**（关键）：① `launchctl print gui/$UID/<已有服务>` 正常 → 通道通；② `launchctl enable` 正常 → 写操作也通；③ **把最小 plist（`/bin/echo`）放 `/tmp` 再 bootstrap 也 EIO** → 与本项目 plist 无关。**修**：同命令 + `danger-full-access` → `rc=0`。**教训**：遇到 `EIO(5)` 先用**最小 plist 做对照实验**，别急着怀疑自己的 plist/权限/路径。

**自启守护实现（已落地并实测）**：`~/.local/bin/dsh-web-guard.sh`（**端口守卫**：`lsof -iTCP:3080 -sTCP:LISTEN` 命中就直接 `exit 0`，避免双实例抢端口）+ `~/Library/LaunchAgents/dev.dsh.web.plist`（`RunAtLoad` + `KeepAlive{SuccessfulExit:false}` + `ThrottleInterval:30`）。
- **⚠️ 铁律：验证自启时绝不能重启 `dsh web`** —— 它就是在服务本次会话的进程，重启等于切断手机链路（agent 自杀）。本会话全程只装不重启。
- **安全验证法**（三重印证，无需重启）：`launchctl print gui/$UID/dev.dsh.web` 看 `runs=1` / `last exit code=0`（守卫走了"端口被占→退出"分支）+ `pgrep -lf "dsh web"` 确认**没冒第二个实例** + `lsof -iTCP:3080` 原 PID 仍在。
- **残留窗口期**：当前实例仍挂在 Terminal 窗口上，关掉窗口它会死，而 LaunchAgent 当时已"跑完"（退出码 0，`SuccessfulExit:false` 不重启）→ 需等下次登录。**重启后**由 launchd 直接拉起、无 tty 依赖，即自愈。
- **`log show` 在沙箱内被拒**（`log: Cannot run while sandboxed`）→ 守卫用 `logger` 写的系统日志读不到，只能靠上面前两条证据定性。

**决策反转记录（被否决的方案：`pmset disablesleep`）**：曾计划 `sudo pmset -a disablesleep 1` + LaunchDaemon 做「合盖不睡」。用户澄清需求是「**正常休眠、醒来能用**」→ **取消**（既已由 64 次睡眠实测满足，且一直不睡伤电池）。**教训：先确认需求口径再选方案**——"远程可用"有「常驻在线」和「睡眠+唤醒自愈」两种截然不同的实现，成本与代价差一个数量级。
- 顺带核实：**Amphetamine 的特权助手从未安装**（`/Library/PrivilegedHelperTools/` 为空）→ 其 closed-display 模式根本没生效，那个 `Single-Use` 断言只是防空闲睡眠、**防不住合盖**；`Never Sleep.app` 只用 `AssertionType`（同 `caffeinate` 机制）同样无效。
- **原理性结论**：**「定时唤醒」App 做不到** —— 睡眠中 App 不运行，而排电源事件（`pmset schedule/repeat`）**需要 root**；且合盖状态下唤醒后很快会再次入睡，故合盖场景只能靠 `disablesleep`（=常驻在线，与本需求矛盾）。

**方法论沉淀**：排查"链路为什么断"时，先**区分「睡眠」与「重启」**——睡眠是挂起（进程活着、网络断），重启是进程消失（需守护）。把两者混为一谈会选错方案（本轮就是先按"常驻在线"设计，后被需求纠正）。

---

## 十、触发 workflow 的坑：提交消息里"提到"跳过关键字同样会被跳过（2026-09-13）

- **坑 15｜跳过关键字是纯字符串匹配，不区分语义上下文**：为避免误触发部署，先推了带跳过关键字的修复提交（✅ 预期内生效，运行总数不变）。随后需要"只跑一次构建"验证真机效果——问题出在**下一次提交**：那是一次记录本次排查的文档提交，其**消息正文里为了说明这个坑，原文引用了跳过关键字**。结果**运行同样没有被创建**。
  - **真因**：GitHub 的跳过检测是对**提交消息做字符串匹配**，包括引号内、说明文字里、错误示范里。
  - **规避**：提交消息里**永远不要出现这些字面量**（`skip ci` / `ci skip` / `no ci` / `skip actions` / `actions skip` 的方括号写法）。要描述它时，写成"**跳过关键字**"。
- **坑 16｜部署前缀同样是纯字符串匹配，提交消息里"提到"就会触发云函数部署（2026-09-17 实测）**：新增"设置页"那次提交的正文里写了"不带 部署前缀"作说明（照抄了前缀字面量），而 workflow 的 `if:` 是 `contains(head_commit.message, '[deploy')` → 命中，于是**纯前端改动也跑了第 11 步"部署云函数"**。所幸脚本按 `git diff HEAD^ HEAD` 判断本次没有 `cloudfunctions/**` 改动 → 无函数可部署，该步骤 success，**未造成实际影响**。**规避**：描述这个前缀时不要在提交消息里打出它的字面量（写"部署前缀"即可），与坑 15 同理；只有**确实要部署云函数**时才在提交消息里写 `[deploy]` / `[deploy:函数名]`。
- **同一轮的另一条观察（未确证）**：期间还推过一个 `--allow-empty` 的**空提交**（消息内无任何跳过关键字字样），**同样没有创建运行**。已用只读 API 逐项排除：
  | 排查项 | 实测结果 |
  |---|---|
  | 推送是否送达 | ✅ `PushEvent refs/heads/main` 已出现在仓库事件流 |
  | workflow 是否被禁用 | ✅ `GET /actions/workflows` → `state=active` |
  | 平台是否异常 | ✅ `githubstatus` → Actions `operational` |
  | 仓库是否受限 | ✅ `private=false`、`archived=false`、`disabled=false` |
  | 按 `head_sha` 反查运行 | ❌ 三次推送的 sha 均 `runs: 0` |
  由于**无法与"前一次推送的跳过状态"完全隔离**，"空提交是否触发"**仍待确证**，不写成结论。保守用法：**想触发构建就带真实文件改动**。
- **可靠的替代路径**：workflow 里已声明 `workflow_dispatch` —— 可在仓库 Actions 页面点 **Run workflow** 手动触发，**完全不受提交消息关键字影响**。本机没有 `gh` CLI 也没有 GitHub token，走不了 API，所以这条只能人工点。
- **待清理（与本坑无关，但长期挂着）**：#14 / #15 两个运行自 09:09Z / 09:27Z 起一直卡在 `queued`（平台 degraded 期间遗留）；同并发组 `wechat-deploy`。**它们并没有阻断后续运行**——证据是 #16~#19 在它们卡住之后仍被正常创建，故不要把它当成"不触发"的替罪羊。
- **⚠️ 方法论教训（本轮真实的教训）**：我**先入为主认定"空提交是真因"，并把它当成结论写进了本文件**，下一轮即被推翻。**未经验证的假设不得写进经验文档**；确需记录时必须显式标注「待确证」，否则错误经验会污染后续所有判断。排查正确姿势仍是用只读 API 把变量逐个证伪（推送事件 / workflow state / 平台状态 / 仓库可见性 / 按 `head_sha` 反查）。
