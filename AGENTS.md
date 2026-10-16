<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 项目速览（给 agent）

- 技术栈：Next.js 16 (App Router) + React 19 + TypeScript，Tailwind CSS 4，Prisma 7 + `@prisma/adapter-libsql`。
  本地数据库是 SQLite 文件 `dev.db`，线上是远端 libSQL（Turso）；**PostgreSQL 已推迟**，见 `DECISIONS.md` 第 5 节。
- 认证：Auth.js v5（`next-auth@beta`）配置在根目录 `auth.ts`，GitHub OAuth + 邮箱密码两个 provider，
  **JWT 会话**（有 Credentials provider 时 Auth.js 不允许数据库会话）。受保护路由在 `proxy.ts`。
- 数据库客户端**必须惰性初始化**：只导出 `getPrisma()`（`lib/prisma.ts`），不要在模块顶层创建客户端或读
  `DATABASE_URL`，否则 `next build` 收集路由时会在没有凭据的构建环境里直接失败。
  同理 `PrismaAdapter(...)` 也必须惰性创建（`auth.ts` 用 Proxy 实现）。
- 改动 schema 后：`npx prisma migrate dev` → 生成的客户端输出到 `app/generated/prisma`（不入库）。
- **Safe defaults**：登录后跳转只允许站内相对路径（`lib/safe-redirect.ts`）；
  会话字段用白名单（`toSessionUser()`）——`PrismaAdapter` 返回整行 `User`，含 `passwordHash`，
  JWT 是编码而非加密，原样塞进去等于把哈希写进用户 cookie。

## Next.js 16 的两条硬约束（踩过，别再犯）

1. **`middleware.ts` 已弃用 → 用 `proxy.ts`**（导出名 `proxy`，运行时固定 `nodejs`，不能配 edge）。
   两个文件同时存在会直接报错。见 `docs/ISSUES.md` 的 #8。
2. **开了 `cacheComponents` 后，`dynamic` / `revalidate` / `fetchCache` / `dynamicParams` 段配置被移除**。
   写 `export const dynamic = "force-dynamic"` 会让整条路由编译失败（页面 500）。
   正确写法是「静态外壳（同步）+ 把请求期数据（`auth()`、`searchParams`、查库）下沉到 `<Suspense>`」，
   并给每个 `<Suspense>` 配同构骨架屏。见 `docs/ISSUES.md` 的 #7 与 `DECISIONS.md` 第 9 节。

## 文档索引

改代码或排查前先看这里，能省掉重复踩坑：

- `TASKS.md` —— 任务清单与进度
- `DECISIONS.md` —— 架构决策记录（第 4 节 Prisma 7 差异、第 8 节认证选型、第 9 节 cacheComponents 写法）
- `docs/DAY3-VERIFICATION.md` —— 认证的验证结果、手测清单与排错对照表
- `docs/DAY4-PLAN.md` —— 书签 CRUD 的规划（开工前先读）
- `docs/ISSUES.md` —— 踩过的坑：现象 / 根因 / 解法
- `docs/SESSION-RECORDS.md` —— 会话过程记录

## 环境注意（受限沙箱 / Windows）

在受限文件沙箱里（如 DSH 会话）有几条已验证的边界，**不要反复重试**，直接换手段：

- `child_process.fork()` **一律**被禁（带不带管道都一样，因为它必须建 IPC 通道），
  因此 `npm run dev` / `next build` / `next build --webpack` / `prisma migrate status` / `prisma studio`
  都会失败（`spawn EPERM`）。这些必须在会话外的普通终端跑。
- 沙箱还禁止**监听端口**（`listen EACCES`）与**出网**。因此真实 OAuth 往返、浏览器手测也无法在会话内完成。
- 能在会话内跑通并用于验证的：`npm run lint`、`tsc --noEmit`、`npx prisma validate`、
  `node scripts/verify-*.mjs`（纯函数部分如 `verify-auth-guards.mjs` 完全可跑）。
- 判断"数据库是否真的通"要看**四层**（HTTP 探活 / schema 与迁移 / 只读查表 / 写入探针）。
  `/api/health` 只做 `count()`，**证明不了写入能力**。
- `dev.db`、`.next` 这类文件若报 `拒绝访问` / `os error 5` / `SQLITE_READONLY`，是 Windows 属主与权限问题，
  按 `docs/ISSUES.md` 的 #1 处理（管理员窗口 `takeown` + `icacls`）。
- `npm run build` 报 `failed to create junction point ... os error 5`：Turbopack 需要创建符号链接，
  需 Windows「开发者模式」或管理员终端，见 `docs/ISSUES.md` 的 #9。
- 写脚本时优先用**文件**而不是 `node -e "..."`：PowerShell 会吃掉内层引号，详见 `docs/ISSUES.md` 的 #5。
- 探针脚本要连库时，用 `scripts/lib/db-url.mjs` 解析连接串（不要把相对路径直接交给 libsql，
  它会按当前工作目录解析、可能连到新建的空库）。
