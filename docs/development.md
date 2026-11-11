# 本地开发与部署说明

本文是项目 README 的配套开发文档，包含完整的本地开发步骤、环境变量、检查与构建命令，以及部署与当前限制。只想了解项目请先看 [项目 README](../README.md)；全部文档见 [文档索引](README.md)。

## 本地开发

### 1. 准备依赖

- JDK 17 或兼容版本、Maven 3.9 系列。
- Node.js `^22.18.0` 或 `>=24.12.0`，以及 npm（与前端 `engines` 声明一致）。
- MySQL，建议使用独立的 MySQL 8+ 开发库。
- 模型 API Key 为可选项；未配置的模型不可用于真实生成。

```bash
git clone https://github.com/Jasp1rC0le/zhangweiqi.git
cd zhangweiqi
```

### 2. 建立独立开发库

通过本机 MySQL 管理客户端执行：

```sql
CREATE DATABASE campus_ai_dev
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

为该库设置专用开发账号，并授予开发所需的建表、索引和读写权限。不要把开发配置指向现有生产库。普通开发配置会在启动时执行当前 `schema.sql`，也会运行部分初始化逻辑；`prod` 配置关闭自动建表，生产升级必须单独审查迁移。

### 3. 配置并启动后端

```bash
umask 077
cp deploy/development.env.example .env
```

编辑本机 `.env`，填写 `DB_USERNAME`、`DB_PASSWORD` 与 `JWT_SECRET`。JWT 密钥必须是至少 32 字节随机数据的 Base64 编码，可以用本机 `openssl rand -base64 32` 生成后填入。可按需填写模型 Key；不要提交实际 `.env`。

```bash
# 在仓库根目录执行；只加载自己创建并信任的本机配置。
set -a
source .env
set +a
cd campus-ai-server
mvn spring-boot:run
```

后端默认地址为 `http://localhost:8080`。`/api/health` 表示进程存活；`/api/health/ready` 会连接当前数据库并检查必要业务表，缺表或连接失败返回 503。已有数据库升级需审查[私有课表增量迁移](../deploy/migrations/2026-10-11-private-timetables.sql)，它新增四张表，不应以完整建表脚本覆盖旧库。

### 4. 启动前端

另开一个终端，在仓库根目录执行：

```bash
cd campus-ai-web
cp .env.example .env.development
npm ci
npm run dev
```

访问 Vite 输出的本机地址，默认是 `http://localhost:5173`。前后端本机配置应使用相同的主机名；修改端口时同步调整 `CORS_ALLOWED_ORIGINS`、`PUBLIC_WEB_URL` 与 `VITE_API_BASE_URL`。

注册创建普通用户。仓库不提供管理员默认密码或自动提权入口；管理功能需要运营者通过受控流程设置已有账号角色。邮箱验证与密码找回需要配置可用 SMTP。

开发预览入口 `/design-review.html?page=projects` 使用隔离演示数据，不能作为真实数据持久化或生产联调通过的证据。

## 环境变量

本地开发使用 [开发模板](../deploy/development.env.example)；仓库根目录 [生产模板](../.env.example) 是 **`prod,free` 生产候选模板**，不能直接当作本机开发配置。Spring Boot 不会自动读取根目录 `.env`，需要由启动终端、IDE 或服务管理器注入。

| 分类 | 主要变量 | 说明 |
| --- | --- | --- |
| 数据库 | `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USERNAME`、`DB_PASSWORD` | 指向专用库；生产禁止空密码和 root 账号 |
| 会话 | `JWT_SECRET`、`AUTH_SECURE_COOKIES` | JWT 密钥必填；正式 HTTPS 环境使用安全 Cookie |
| 来源 | `CORS_ALLOWED_ORIGINS`、`PUBLIC_WEB_URL` | 与浏览器真实访问地址一致 |
| 模型 | `DEEPSEEK_API_KEY`、`KIMI_API_KEY`、`GLM_API_KEY` | 仅在后端设置；模型与接口地址可通过对应变量覆盖 |
| 额度与预算 | `AI_DAILY_TOKEN_LIMIT`、`AI_MAX_CONCURRENT`、`AI_PLATFORM_DAILY_CNY`、`AI_PLATFORM_MONTHLY_CNY` | 开发默认用户额度 60000 Token，生产默认 20000；活跃管理员豁免账号日额度，但仍记录使用并受平台费用和并发保护 |
| 可选检索 | `BOCHA_API_KEY`、`WEB_SEARCH_ENABLED`、`KNOWLEDGE_SEMANTIC_API_KEY`、`KNOWLEDGE_SEMANTIC_ENABLED`、`KNOWLEDGE_RERANK_ENABLED` | 启用外部服务可能产生费用；`free` 配置关闭这些额外检索能力 |
| 邮件与反馈 | `SMTP_*`、`CONTACT_RECIPIENT_EMAIL`、`CONTACT_SCHOOL_ID` | 邮箱功能需要真实配置；访客反馈学校为 0 时禁用访客提交 |
| 生产隐私配置 | `PRIVACY_POLICY_APPROVED`、`PRIVACY_OPERATOR_NAME`、`PRIVACY_CONTACT_EMAIL` 等 | 必须根据实际主体、第三方和留存政策审查后填写 |
| 前端公开配置 | `VITE_API_BASE_URL`、`VITE_PUBLIC_OPERATOR`、`VITE_ICP_FILING`、`VITE_PSB_FILING` | `VITE_` 值会进入浏览器构建，不能放任何秘密 |

费用估算依赖运营者维护模型单价；模板中的价格是历史配置示例，需要按供应商当前账单口径核对，应用预算不等于供应商最终账单或硬性计费上限。

## 检查与构建

以下命令与仓库现有测试和构建入口对应：

```bash
# 仓库根目录：部署脚本的单元回归
node --test --test-timeout=15000 deploy/*.test.mjs

# 后端：测试并生成 JAR
cd campus-ai-server
mvn verify
cd ..

# 前端：安装锁定依赖、单元回归、只读 lint、生产构建
cd campus-ai-web
npm ci
npm test
npx eslint src
npm run build
```

`npm run lint` 包含自动修复选项；仅审查代码时使用上面的 `npx eslint src`。`UserMapperTest` 只有显式设置 `RUN_MYSQL_INTEGRATION_TESTS=true` 才连接真实数据库；不要在不清楚目标库时打开它。

前端产物位于 `campus-ai-web/dist/`，后端产物位于 `campus-ai-server/target/`，均不入库。`bash deploy/build-release.sh` 可生成本机候选发布包；它会重新安装前端依赖并运行验证，**不会自动部署服务器**。

## 部署与当前限制

部署前阅读 [运行手册](free-launch-runbook.md) 与 [发布检查表](launch-readiness.md)。仓库提供 Caddy、systemd、迁移、备份与恢复脚本；生产数据库升级、域名、HTTPS、邮件、隐私说明及所需资质都需要在目标环境单独确认。

- 生产使用 `prod,free` 时关闭自动建表；先按目标数据库版本审查完整结构和增量迁移，已有数据不得直接用空库流程覆盖。
- AI 供应商、SMTP、公网 HTTPS、付费调用、异机恢复及真实账号流程需要专门验收；本地测试通过不能代替这些验证。
- 当前语义向量存于 MySQL，并由 Java 计算相似度；规模增长时需要重新评估检索实现。进程内并发限制和熔断也需要在多实例部署时调整。
- 研究原件、内部招生材料、真实账号截图、导入回执、SQLite 资料库和个人运行脚本保留在维护者本机，不属于本源码发布。应用不依赖这些文件启动。
- 仓库未新增开源许可证；使用、转载代码或校园图片前应确认相应授权。

进一步了解实现与历史验收边界，请从 [文档索引](README.md) 开始。
