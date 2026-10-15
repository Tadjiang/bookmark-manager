<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 项目速览（给 agent）

- 技术栈：Next.js 16 (App Router) + React 19 + TypeScript，Tailwind CSS 4，Prisma 7 + `@prisma/adapter-libsql`。
  本地数据库是 SQLite 文件 `dev.db`，线上是远端 libSQL（Turso）；**PostgreSQL 已推迟**，见 `DECISIONS.md` 第 5 节。
- 数据库客户端**必须惰性初始化**：只导出 `getPrisma()`（`lib/prisma.ts`），不要在模块顶层创建客户端或读
  `DATABASE_URL`，否则 `next build` 收集路由时会在没有凭据的构建环境里直接失败。同理，Day 3 接认证时
  `PrismaAdapter(...)` 也不要写在模块顶层。
- 改动 schema 后：`npx prisma migrate dev` → 生成的客户端输出到 `app/generated/prisma`（不入库）。

## 文档索引

改代码或排查前先看这里，能省掉重复踩坑：

- `TASKS.md` —— 任务清单与进度
- `DECISIONS.md` —— 架构决策记录（第 4 节是 Prisma 7 的破坏性差异，**写 Prisma 代码前建议先读**）
- `docs/ISSUES.md` —— 踩过的坑：现象 / 根因 / 解法
- `docs/SESSION-RECORDS.md` —— 会话过程记录

## 环境注意（受限沙箱 / Windows）

在受限文件沙箱里（如 DSH 会话）有几条已验证的边界，**不要反复重试**，直接换手段：

- `npm run dev`、`npm run build`、`npx prisma migrate status`、`npx prisma studio` 会报 `spawn EPERM`
  （沙箱禁止带管道的子进程）。这些必须在会话外的普通终端跑。
- 能在会话内跑通并用于验证的：`npm run lint`、`npx prisma validate`、`node scripts/verify-day2-probe.mjs`、
  `curl.exe http://localhost:3000/api/health`。
- 判断"数据库是否真的通"要看**四层**（HTTP 探活 / schema 与迁移 / 只读查表 / 写入探针）。
  `/api/health` 只做 `count()`，**证明不了写入能力**。
- `dev.db`、`.next` 这类文件若报 `拒绝访问` / `os error 5` / `SQLITE_READONLY`，是 Windows 属主与权限问题，
  按 `docs/ISSUES.md` 的 #1 处理（管理员窗口 `takeown` + `icacls`）。
- 写脚本时优先用**文件**而不是 `node -e "..."`：PowerShell 会吃掉内层引号，详见 `docs/ISSUES.md` 的 #5。
