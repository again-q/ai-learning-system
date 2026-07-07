# 技术栈 JSON Schema

本文件定义了每份架构设计文档必须同步生成的 `tech-stack.json` 文件的**强制 JSON Schema**。

## 输出要求

- **文件名**：`tech-stack.json`（固定）
- **保存位置**：与架构 Markdown 文档同一目录（如 `doc/arch/tech-stack.json`）
- **生成时机**：始终与 Markdown 设计文档同时生成

---

## JSON Schema

```json
{
  "project": "项目名称",
  "version": "1.0",
  "generatedAt": "YYYY-MM-DD",
  "techStack": {
    "backend": [
      {
        "name": "技术名称",
        "version": "版本号（未知时使用最新稳定版）",
        "category": "分类（如 framework / orm / security / messaging）",
        "purpose": "该技术在本项目中的用途",
        "rationale": "选择该技术而非其他方案的原因",
        "officialUrl": "官方文档或仓库 URL"
      }
    ],
    "frontend": [
      {
        "name": "技术名称",
        "version": "版本号",
        "category": "分类（如 framework / ui-library / build-tool / state-management）",
        "purpose": "该技术在本项目中的用途",
        "rationale": "选择该技术而非其他方案的原因",
        "officialUrl": "官方文档或仓库 URL"
      }
    ],
    "miniapp": [
      {
        "name": "技术名称",
        "version": "版本号",
        "category": "分类（如 framework / ui-library / build-tool / state-management）",
        "purpose": "该技术在本项目中的用途",
        "rationale": "选择该技术而非其他方案的原因",
        "officialUrl": "官方文档或仓库 URL"
      }
    ],
    "database": [
      {
        "name": "技术名称",
        "version": "版本号",
        "category": "分类（如 relational / cache / nosql / search）",
        "purpose": "该技术在本项目中的用途",
        "rationale": "选择该技术而非其他方案的原因",
        "officialUrl": "官方文档或仓库 URL"
      }
    ],
    "infrastructure": [
      {
        "name": "技术名称",
        "version": "版本号",
        "category": "分类（如 container / reverse-proxy / message-queue / storage / monitoring）",
        "purpose": "该技术在本项目中的用途",
        "rationale": "选择该技术而非其他方案的原因",
        "officialUrl": "官方文档或仓库 URL"
      }
    ],
    "blockchain": [
      {
        "name": "技术名称",
        "version": "版本号",
        "category": "分类（如 platform / sdk / smart-contract / consensus）",
        "purpose": "该技术在本项目中的用途",
        "rationale": "选择该技术而非其他方案的原因",
        "officialUrl": "官方文档或仓库 URL"
      }
    ],
    "devops": [
      {
        "name": "技术名称",
        "version": "版本号",
        "category": "分类（如 ci-cd / containerization / deployment / testing）",
        "purpose": "该技术在本项目中的用途",
        "rationale": "选择该技术而非其他方案的原因",
        "officialUrl": "官方文档或仓库 URL"
      }
    ]
  },
  "summary": {
    "totalComponents": 0,
    "openSourceCount": 0,
    "commercialCount": 0,
    "primaryLanguage": "主要编程语言",
    "deploymentTarget": "部署目标（如 Docker / K8s / Cloud / On-Premise）"
  }
}
```

---

## 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `project` | string | 项目名称 |
| `version` | string | 文档版本，默认 `"1.0"` |
| `generatedAt` | string | 生成日期，格式 `YYYY-MM-DD` |
| `techStack.*` | array | 各分组的技术列表（见下方分组说明） |
| `name` | string | 技术名称 |
| `version`（条目） | string | 版本号；未知时使用最新稳定版 |
| `category` | string | 分组内的子分类 |
| `purpose` | string | 该技术在项目中的作用 |
| `rationale` | string | 选择该技术而非其他方案的原因 |
| `officialUrl` | string | 官方文档或仓库 URL |
| `summary.totalComponents` | number | 所有分组条目的总数 |
| `summary.openSourceCount` | number | 开源技术数量 |
| `summary.commercialCount` | number | 商业/付费技术数量 |
| `summary.primaryLanguage` | string | 主要编程语言 |
| `summary.deploymentTarget` | string | 目标部署环境 |

---

## 分组规则

| 分组 | 包含条件 |
|------|---------|
| `backend` | 项目有服务端逻辑 |
| `frontend` | 项目有 Web UI 层（Vue3 / React 等） |
| `miniapp` | 项目有微信小程序端（原生 / Taro / uni-app） |
| `database` | 项目使用任何数据存储 |
| `infrastructure` | 项目使用容器、代理、消息队列或监控 |
| `blockchain` | 项目涉及区块链/智能合约（否则省略） |
| `devops` | 项目有 CI/CD、容器化或自动化部署 |

不相关的分组直接省略，不要包含空数组。

---

## 注意事项

- **标识性字段**（`name`、`version`、`category`、`officialUrl`、`summary.primaryLanguage`、`summary.deploymentTarget`）必须使用**英文**填写，以保持 JSON 的国际通用性。
- **描述性字段**（`purpose`、`rationale`）允许使用中文，便于团队内部沟通和 task-decomposer 读取理解。
- `summary.totalComponents` = 所有已包含分组的条目总和。
- `summary.openSourceCount` + `summary.commercialCount` 应等于 `summary.totalComponents`。
- `blockchain` 分组为**可选项**，仅在项目涉及区块链技术时出现。