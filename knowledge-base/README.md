# 知识库同步镜像

**不是运行时依赖。** 由 [`config/sync-config.json`](../config/sync-config.json) 定义，将项目文档同步到外部知识库平台（Notion / 飞书 / 语雀等）。

- 改文档以 `doc/`、根目录 `README.md` / `CLAUDE.md` 为准
- 本目录内容为同步副本，勿在此单独维护业务逻辑

同步报告：`bash scripts/sync-report.sh`
