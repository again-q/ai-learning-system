# coding-enforcement-kit — AI 编码门禁套件

将**编码门禁**注入 Reasonix 项目的零成本方案。AI 必须按 PRD → 架构 → 详细设计 → 编码 → 代码评审 五阶段推进，PreToolUse Hook 在基础设施层强制拦截未经验证的编辑。

## 快速开始

```bash
# 安装到项目
bash setup.sh /path/to/your-project

# 启动 Reasonix
reasonix code /path/to/your-project

# 查看当前进度
bash gate.sh status
```

## 管道流程

```
PRD ──→ prd-writer ──→ review-expert ──→ 归零 ──→ pass prd
  ↓
架构 ──→ system-architect ──→ review-expert ──→ 归零 ──→ pass arch
  ↓
详细设计 ──→ task-decomposer ──→ review-expert ──→ 归零 ──→ pass detailed
  ↓
编码 ──→ gatekeeper ──→ code-reviewer ──→ 修复 ──→ 归零 ──→ gate.sh post
  ↓
代码评审 ──→ code-reviewer ──→ gatekeeper 修复 ──→ 归零 ──→ pass review
```

## 防御机制

| 层 | 机制 | 强制力 |
|----|------|--------|
| 运行时拦截 | `PreToolUse` Hook → `gate-hook.sh` | **基础设施级**，AI 无法绕过 |
| AI 行为引导 | `coding-rules.md` + `CLAUDE.md` + 6 个 Skill | 建议性 |
| 门禁状态管理 | `gate.sh check / pass / unpass / status` | 手动管理 |

## 文件结构

```
├── setup.sh                     # 一键安装到其他项目
├── coding-rules.md              # AI 编码铁律（注入系统提示）
├── CLAUDE.md                    # AI 行为规则
│
├── .reasonix/
│   ├── settings.json            # PreToolUse Hook 配置
│   └── skills/
│       ├── prd-writer/          # 写需求文档
│       ├── system-architect/    # 写架构文档
│       ├── task-decomposer/     # 写详细设计文档
│       ├── conductor/           # 管道指挥家（自动编排）
│       ├── gatekeeper/          # 编码执行
│       ├── code-reviewer/       # 代码审查
│       └── review-expert/       # 文档评审
│
├── scripts/
│   ├── gate.sh                  # 统一门禁 CLI
│   ├── doc-gate.sh              # 阶段门禁管理
│   ├── verify-coding.sh         # 编码验证
│   └── gate-hook.sh             # PreToolUse 门禁脚本
│
└── doc/
    └── .gate/                   # 阶段标记目录
```

## 七个 Skill

| Skill | 职责 | 调用方式 |
|-------|------|---------|
| **`conductor`** | **全自动编排五阶段管道** | **`run_skill({ name: "conductor", arguments: "module=... task=..." })`** |
| `prd-writer` | 写产品需求文档 | `run_skill({ name: "prd-writer", arguments: "..." })` |
| `system-architect` | 写架构设计文档 | `run_skill({ name: "system-architect", arguments: "..." })` |
| `task-decomposer` | 写详细设计文档 | `run_skill({ name: "task-decomposer", arguments: "..." })` |
| `gatekeeper` | 按设计文档编码 | `run_skill({ name: "gatekeeper", arguments: "module=... task=..." })` |
| `code-reviewer` | 审查代码质量 | `run_skill({ name: "code-reviewer", arguments: "..." })` |
| `review-expert` | 评审文档 | `run_skill({ name: "review-expert", arguments: "..." })` |
|-------|------|---------|
| `prd-writer` | 写产品需求文档 | `run_skill({ name: "prd-writer", arguments: "..." })` |
| `system-architect` | 写架构设计文档 | `run_skill({ name: "system-architect", arguments: "..." })` |
| `task-decomposer` | 写详细设计文档 | `run_skill({ name: "task-decomposer", arguments: "..." })` |
| `gatekeeper` | 按设计文档编码 | `run_skill({ name: "gatekeeper", arguments: "module=... task=..." })` |
| `code-reviewer` | 审查代码质量 | `run_skill({ name: "code-reviewer", arguments: "..." })` |
| `review-expert` | 评审文档 | `run_skill({ name: "review-expert", arguments: "..." })` |

## 安装

```bash
bash setup.sh                      # 当前目录（自愈）
bash setup.sh /path/to/target      # 安装到其他项目
```

安装后启动 Reasonix，PreToolUse Hook 自动生效：

```bash
reasonix code /path/to/target
```

## 扩展

### test-enforcement-kit（可选）

[test-enforcement-kit](https://gitee.com/zhan_pu/test-enforcement-kit) 是本套件的测试扩展，在核心五阶段管道完成后按需启用：

```
核心管道（必选）：PRD → 架构 → 详细设计 → 编码 → 代码评审
测试扩展（可选）：tester → review-expert → 测试执行 → 归零
```

详见 [test-enforcement-kit](https://gitee.com/zhan_pu/test-enforcement-kit) 仓库。

## 依赖

- **Reasonix** — 必须。套件基于 Reasonix 的 PreToolUse Hook 和 Skill 机制运行
- **ai_memory**（可选） — MCP 工具，用于跨会话记忆管理

## 贡献

欢迎提交 Issue 和 PR。阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解开发指南。

## 许可证

MIT
