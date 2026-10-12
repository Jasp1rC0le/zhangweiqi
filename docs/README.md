# Campthink 文档索引

首次运行请阅读 [项目 README](../README.md)。本文档集保留软件设计与验收方法，并把本机研究原件、内部资料、数据库及账号截图排除在源码发布之外。

## 产品与架构

- [产品定位与约束](../PRODUCT.md)
- [项目总体规划](project-master-plan.md)：本次整理后的能力边界与后续方向
- [工作台界面约定](workspace-surface-brief.md)与[设计交接](workspace-design-handoff.md)
- [项目工作室设计](project-studio-surface.md)
- [前端设计记录](frontend-redesign-2026-09-23.md)

## 功能与验证记录

- 项目：[项目工作室](project-studio-acceptance.md)、[数据检查](project-data-check-acceptance.md)、[公式复算](formula-check-acceptance.md)、[附件与协作](attachments-collaboration-acceptance.md)、[项目指导](project-guidance-acceptance.md)
- 校园业务：[校园墙与仪器](wall-instruments-workspace-acceptance.md)、[食堂社区](canteen-community-acceptance.md)
- 私有课表：[导入格式、账号隔离及迁移说明](private-timetable.md)
- 前端：[交互验收](frontend-acceptance-2026-09-23.md)、[异常恢复](frontend-resilience-acceptance.md)
- 安全：[安全加固](security-hardening-2026-09-24.md)、[安全验证记录](security-progress-acceptance.md)

这些带日期的文档记录当时的实现与测试条件，可能与后续版本存在差异。文中标注为“本机留存”的截图、日志、脚本或研究材料未发布；过去的通过记录不代表本次检查已经重跑。当前执行结果见 [本次发布验证](free-launch-acceptance.md)。

## 开发与部署

- [本地开发配置模板](../deploy/development.env.example)
- [生产配置模板](../.env.example)
- [运行手册](free-launch-runbook.md)
- [上线前检查](launch-readiness.md)
- [运营与备案准备边界](icp-filing-plan.md)

配置示例不包含实际密钥，不提供默认管理员账号。完整数据库结构以服务端资源目录中的 `schema.sql` 为准。
