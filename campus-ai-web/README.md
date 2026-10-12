# Campthink 前端

Vue 3 / Vite 应用，包含校园问答、个人项目、学习工具、校园社区和管理页面。完整依赖、后端配置与启动步骤见 [项目 README](../README.md)。

## 开发

Node.js 要求 `^22.18.0` 或 `>=24.12.0`。

```bash
cp .env.example .env.development
npm ci
npm run dev
```

本机默认通过 `VITE_API_BASE_URL=http://localhost:8080` 访问后端。生产使用同源反向代理时，将该变量设为空再构建；所有 `VITE_` 配置都会进入浏览器，不能写入秘密。

## 检查与构建

```bash
node --test tests/*.test.js tests/*.test.mjs
npx eslint src
npm run build
```

`npm run lint` 会自动修复代码；只读检查用 `npx eslint src`。构建输出在 `dist/`，不提交生成文件。

`design-review.html` 与 `design/` 提供开发环境内存演示，不代表真实账号或后端持久化流程通过验收。真实联调需启动对应版本后端。
