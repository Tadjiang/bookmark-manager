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
- **书签 CRUD 的形态（Day 4 起）**：写操作走 **Server Actions**（`app/actions/bookmarks.ts`），
  读完调 `refresh()`；读走 Server Component 直接查库。**越权防护只有一条纪律**：
  `lib/bookmarks.ts` 里每个导出函数第一件事就是取会话拿 `userId`，**绝不接受调用方传入 `userId`**
  （`getBookmark` 用 `findFirst({ where: { id, userId } })`，`deleteBookmark` 用 `deleteMany(同款)`）。
  标签名一律经 `lib/bookmark-input.ts` 的 `normalizeTagName` 转小写后入库，
  否则 SQLite 区分大小写会让 `Work` 与 `work` 变成两行。见 `DECISIONS.md` 第 10 节。

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
- `DECISIONS.md` —— 架构决策记录（第 4 节 Prisma 7 差异、第 8 节认证选型、第 9 节 cacheComponents 写法、
  第 10 节书签 CRUD 形态）
- `docs/DAY3-VERIFICATION.md` —— 认证的验证结果、手测清单与排错对照表
- `docs/DAY4-PLAN.md` —— 书签 CRUD 的规划（含当时的取舍，已落地为方案 A）
- `docs/DAY4-VERIFICATION.md` —— 书签 CRUD 的验证结果、探针覆盖**边界**、手测清单与排错对照表
- `docs/ISSUES.md` —— 踩过的坑：现象 / 根因 / 解法
- `docs/SESSION-RECORDS.md` —— 会话过程记录

## 环境注意（受限沙箱 / Windows）

在受限文件沙箱里（如 DSH 会话）有几条已验证的边界，**不要反复重试**，直接换手段：

- `child_process.fork()` **一律**被禁（带不带管道都一样，因为它必须建 IPC 通道），
  因此 `npm run dev` / `prisma migrate status` / `prisma studio` 会失败（`spawn EPERM`）。
  `npm run build` 的情况随会话不同：2026-10-16 那次 CLI 已经能跑起来、走到了 Turbopack 阶段，
  卡在 Windows 符号链接权限上（见下）而不是 `spawn EPERM`。总之构建别指望在会话内完成。
- 沙箱还禁止**监听端口**（`listen EACCES`）与**出网**。因此真实 OAuth 往返、浏览器手测也无法在会话内完成。
- **写入被拒先分清三种原因**，别一律当成"属主问题"去 `takeown`：
  1. 进程是**低完整性级别**（`whoami /all` 看 `Mandatory Label`），而对象**没有** `Low` 完整性标记
     → 报 `Access to the path ... denied`；这是 MIC 在 DACL 之后判定，`icacls` 看不出来，见 #11；
  2. 对象**属主是外来账号**（如 `Rebirth\CodexSandboxOffline`）→ 想改它的权限/标记都会被拒，见 #1；
  3. 只是**父目录**写不了（`.git/index.lock`、SQLite 的 `-journal`/`-wal` 都属于这种）。
- 能在会话内跑通并用于验证的：`npm run lint`、`tsc --noEmit`、`npx prisma validate`、
  `node scripts/verify-*.mjs`（含连库的写入探针，前提是 `dev.db` 有 `Low` 标记）。
- 判断"数据库是否真的通"要看**四层**（HTTP 探活 / schema 与迁移 / 只读查表 / 写入探针）。
  `/api/health` 只做 `count()`，**证明不了写入能力**。
- `dev.db`、`.next` 这类文件若报 `拒绝访问` / `os error 5` / `SQLITE_READONLY`，是 Windows 属主与权限问题，
  按 `docs/ISSUES.md` 的 #1 处理（管理员窗口 `takeown` + `icacls`）。
- `npm run build` 报 `failed to create junction point ... os error 5`：Turbopack 需要创建符号链接，
  需 Windows「开发者模式」或管理员终端，见 `docs/ISSUES.md` 的 #9。
- 写脚本时优先用**文件**而不是 `node -e "..."`：PowerShell 会吃掉内层引号，详见 `docs/ISSUES.md` 的 #5。
- 探针脚本要连库时，用 `scripts/lib/db-url.mjs` 解析连接串（不要把相对路径直接交给 libsql，
  它会按当前工作目录解析、可能连到新建的空库）。
