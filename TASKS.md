# 书签管理器 MVP - 任务清单

## 项目目标
极简书签管理器 MVP - 核心功能为：快速保存、组织、搜索书签

## 技术栈
- **前端框架**：Next.js 16 (App Router) + React 19 + TypeScript
- **样式**：Tailwind CSS 4
- **数据库**：SQLite (本地) / 远端 libSQL - Turso (线上)；PostgreSQL 推迟，见 [DECISIONS.md 第 5 节](./DECISIONS.md)
- **ORM**：Prisma
- **认证**：NextAuth.js
- **部署**：Vercel

## 功能清单

### P0 - MVP 核心功能（第一阶段）
- [x] 用户认证（登录/注册/登出）（Day 3）
- [x] 添加书签（URL + 标题 + 描述 + 分类标签）（Day 4）
- [x] 书签列表展示（Day 4）
- [x] 搜索书签（按标题/URL）（Day 4）
- [x] 删除书签（Day 4）
- [x] 基础 UI（响应式设计）（Day 4）

### P1 - 功能增强（第二阶段）
- [x] 编辑书签（Day 4 一并做了：与新增共用同一套表单与校验）
- [x] 按分类筛选（Day 4 的标签筛选 `?tag=`，可与关键词叠加）
- [ ] 书签导入（HTML 格式）
- [ ] 书签导出（HTML 格式）
- [ ] 暗黑模式切换
- [ ] 分页 / 无限滚动（当前用 `MAX_BOOKMARKS = 200` 收口）

### P2 - 高级功能（第三阶段）
- [ ] 书签收藏夹
- [ ] 分享功能
- [ ] 书签统计面板
- [ ] 浏览器扩展
- [ ] 全文搜索优化
- [ ] 团队协作

## 当前进度

> ### 📍 当前状态（2026-10-16 收尾）
>
> - ✅ **Day 1–4 全部完成**（初始化 / 数据库 / 认证 / 书签 CRUD），代码已提交并推送到 GitHub。
> - ✅ **远端数据库（Turso）已配好**：迁移已应用，`npm run db:verify:remote` 返回 `RESULT_OK`（目前是空库）。
> - ✅ **Vercel 已上线**：部署 `Status: Ready` / `Environment: Production`。
> - ❌ **国内访问被阻塞**：`*.vercel.app` 遭 DNS 污染 + SNI 阻断，域名打不开。
>   这是**当前唯一的阻塞项**，解法与步骤见 **[docs/DAY5-PLAN.md](./docs/DAY5-PLAN.md)**，
>   技术细节见 [docs/ISSUES.md #12](./docs/ISSUES.md)。
> - ⏸ **线上功能验证未做**（打不开就没法验），等自定义域名就绪后补。
> - ⚠️ **Vercel 环境变量是否已配，本次未确认**——`DAY5-PLAN.md` 第 3.1 节有确认方法。
>
> **下一轮开工前先读 [docs/DAY5-PLAN.md](./docs/DAY5-PLAN.md)。**


### ✅ Day 1 - 初始化 + 部署完成
- [x] 使用 create-next-app 初始化项目
- [x] 配置 TypeScript + ESLint
- [x] 集成 Tailwind CSS 4
- [x] 初始化 Git 仓库
- [x] 推送到 GitHub (main 分支)

> 2026-10-15 复查：`npm run lint` 通过；依赖版本为 next 16.4.0 / react 19.3.0 / tailwindcss 4.3.3；
> 工作区干净，`main` 与 `origin/main` 同为 `35d4adb`。

### ✅ Day 2 - 数据库 + ORM 配置完成
- [x] 初始化 Prisma（7.10.0 ORM CLI）
- [x] 配置 SQLite 本地数据库
- [x] 设计数据模型（认证 4 张表 + 业务 2 张表）
- [x] 生成 Prisma Client
- [x] 创建迁移文件（`20261014073756_init`）
- [x] 配置 driver adapter（Prisma 7 强制要求）
- [x] 端到端验证：`/api/health` 读写通过、`next build` 通过

> 2026-10-15 复查（逐条实跑，过程见 [docs/SESSION-RECORDS.md](./docs/SESSION-RECORDS.md)）：
>
> | 验证项 | 手段 | 结果 |
> | --- | --- | --- |
> | schema 合法 | `npx prisma validate` | ✅ |
> | 迁移已应用 | `_prisma_migrations` 中 `20261014073756_init`，`PENDING=none` | ✅ |
> | 表结构 | 查 `sqlite_master` | ✅ 6 张业务表 + `_BookmarkToTag` |
> | 读链路 | `curl /api/health` | ✅ 200 `{"ok":true,"users":1,"bookmarks":1,"tags":2}` |
> | 写 + 关联 + 搜索 | `node scripts/verify-day2-probe.mjs` | ✅ `WRITE_OK` / `RELATION_OK` / `SEARCH_OK` |
> | 级联删除 | 同上 | ✅ `CASCADE_OK`（`onDelete: Cascade` 生效） |
> | 构建 | `.next` 中 2026-10-14 23:29 的产物，`routes-manifest.json` 含 `/api/health` | ✅（历史构建；复查当时因 `.next` 属主权限问题无法重跑，见 [docs/ISSUES.md #1](./docs/ISSUES.md)） |
>
> 勘误：上面"读写通过"里的**写**，当时其实只验了 `count()`（只读）。本次才补上用探针验证的写入与级联。

## 下一步

### ✅ Day 3 - 用户认证完成（2026-10-15）
- [x] 确定登录方式：**GitHub OAuth + 邮箱+密码 两者都要**
- [x] 安装并集成 Auth.js（NextAuth v5，`next-auth@5.0.0-beta.32`）
- [x] 配置认证提供商：GitHub OAuth + Credentials（邮箱密码）
- [x] 实现登录页面 `/signin`
- [x] 实现注册页面 `/register`
- [x] 实现登出功能
- [x] 添加受保护路由 `/dashboard`（`proxy.ts` 拦截 + 页面内二次校验）
- [x] 会话策略：JWT（有 Credentials provider 时 Auth.js 不允许数据库会话）
- [x] 密码哈希：Node 内置 `scrypt`（零依赖，见 `lib/password.ts`）
- [x] 未新增迁移（Day 2 已按 Auth.js 约定建好 4 张认证表，`passwordHash` 当时就是可空字段）

> 2026-10-15 验证（过程见 [docs/SESSION-RECORDS.md](./docs/SESSION-RECORDS.md)「第二轮」，
> 逐条结果与排错见 [docs/DAY3-VERIFICATION.md](./docs/DAY3-VERIFICATION.md)）：
>
> | 验证项 | 结果 |
> | --- | --- |
> | `eslint` / `tsc --noEmit` | ✅ 0 错误 |
> | 安全护栏探针（open redirect、会话字段白名单等 52 项） | ✅ `RESULT_OK` |
> | adapter 契约探针（Prisma 7 上 14 个方法，19 项断言） | ✅ `RESULT_OK` |
> | 邮箱+密码探针（16 项，含失败分支） | ✅ `RESULT_OK` |
> | HTTP 端到端探针（dev） | ✅ `RESULT_OK` |
> | HTTP 端到端探针（**生产构建**） | ✅ `RESULT_OK` |
> | `npm run build` | ✅ exit 0，`BUILD_ID=bl4_ZobflmWcOEqijd9bz` |
> | GitHub provider 条件注册 | ✅ 有凭据→注册并显示按钮；无凭据→隐藏并提示 |
> | Day 2 回归 | ✅ `/api/health` 正常、探针通过、数据库回到基线 |
>
> ⏳ 仍待人工完成：**GitHub 真实授权往返**（会话内出网被禁）与**浏览器手测 10 条**
> （清单见 [docs/DAY3-VERIFICATION.md](./docs/DAY3-VERIFICATION.md) 第 3 节）。
>
> 本轮踩到并修掉的 Next 16 硬约束：`cacheComponents` 与 `dynamic` 等段配置互斥
> （[ISSUES #7](./docs/ISSUES.md)）、`middleware.ts` 已改名 `proxy.ts`（[ISSUES #8](./docs/ISSUES.md)）。

### ✅ Day 4 - 书签 CRUD（2026-10-16）
- [x] 写操作：创建 / 更新 / 删除（Server Actions，`app/actions/bookmarks.ts`）
- [x] 查询层：列表 / 详情 / 标签（`lib/bookmarks.ts`，处处强制 `userId`）
- [x] 输入校验与标签归一化（`lib/bookmark-input.ts`）
- [x] UI：书签表单（新增与编辑共用同一组件）
- [x] UI：书签列表（空状态区分"没有书签"与"筛选无结果"）
- [x] UI：搜索（标题/URL，300ms 防抖）+ 标签筛选（可与关键词叠加）
- [x] UI：删除二次确认 + 行内编辑
- [x] 基础 UI：响应式、流式加载骨架、字段级与整体错误提示

> **接口形态已按 [DECISIONS.md 第 10 节](./DECISIONS.md) 从"5 个 REST 路由"改为
> 方案 A（Server Actions + Server Component 查询）**，用户拍板；原有的 5 条
> `/api/bookmarks*` 条目因此删除，不再保留"待补 REST"的错觉。
>
> 验证（逐条实跑，过程见 [docs/DAY4-VERIFICATION.md](./docs/DAY4-VERIFICATION.md)）：
>
> | 验证项 | 结果 |
> | --- | --- |
> | `eslint` / `tsc --noEmit` | ✅ 0 错误 |
> | 输入校验 + 标签归一化 + 静态护栏（48 项） | ✅ `RESULT_OK` |
> | 数据库链路（越权/搜索/筛选/级联，23 项） | ✅ `RESULT_OK`，`BASELINE == FINAL` |
> | Day 2 / Day 3 回归探针 | ✅ 全部 `RESULT_OK` |
> | `npm run build` | ✅ exit 0，8 条路由；`/dashboard` 为 `◐ Partial Prerender`（会话内会卡在 junction point，见 [ISSUES #9](./docs/ISSUES.md)） |
> | 浏览器手测 12 条 | ✅ 2026-10-16 全部通过（清单见 [docs/DAY4-VERIFICATION.md](./docs/DAY4-VERIFICATION.md) 第 4 节） |
>
> Day 4 已全部完成并提交（`a054920`）。

### 🎨 Day 5 - UI 优化 + 部署
- [ ] 完善样式
- [ ] 响应式设计测试
- [ ] 错误处理 + 加载状态
- [x] 部署到 Vercel（已上线：`Status: Ready` / `Production`）
- [x] 配置线上数据库（远端 libSQL / Turso）——迁移已应用，`db:verify:remote` 通过
- [ ] **【阻塞中】绑自定义域名**，让线上在国内可访问（`*.vercel.app` 被 DNS 污染 + SNI 阻断）
- [ ] 域名就绪后：改 GitHub OAuth 回调 + 在线上重跑 Day 4 手测 12 条
- [ ] 确认 Vercel 环境变量（`DATABASE_URL` / `DATABASE_AUTH_TOKEN` / `AUTH_SECRET`）——**尚未验证**

> **完整的开工指引见 [docs/DAY5-PLAN.md](./docs/DAY5-PLAN.md)**（进度快照、域名绑定清单、
> 未验证事项、环境注意、遗留汇总都在那里）。
>
> 远端运维命令：
>
> | 命令 | 作用 |
> | --- | --- |
> | `npm run db:migrate:remote` | 把 `prisma/migrations` 应用到远端，记录写进 `_applied_migrations`（带 checksum 校验） |
> | `npm run db:verify:remote` | 远端自检：连接 / schema 齐全 / 迁移对账 / 写入+关联+级联 / 行数复原 |
> | `npm run db:verify:local` | 本地同类自检（原 `node scripts/verify-day2-probe.mjs`） |
>
> 本地环境变量用 **`REMOTE_DATABASE_URL` / `REMOTE_DATABASE_AUTH_TOKEN`**，与应用的
> `DATABASE_URL` 分开——避免本地 `npm run dev` 直接读写线上数据。Vercel 上则配
> `DATABASE_URL` / `DATABASE_AUTH_TOKEN` / `AUTH_SECRET`。详见 [README 的「线上数据库」](./README.md)。

## 遗留待办

- [x] ~~**用户先行验证后再提交**：Day 3 改动~~ → 已于 2026-10-16 提交（`64a3878`）
- [x] ~~**Day 4 的 `npm run build` 与浏览器手测**~~ → 2026-10-16 均已完成：构建 exit 0
      （8 条路由，`/dashboard` 为 `◐`），浏览器手测 12 条全部通过
- [ ] **【最高优先级】绑自定义域名**：`*.vercel.app` 在国内被 DNS 污染 + SNI 阻断，
      线上打不开。步骤见 [docs/DAY5-PLAN.md](./docs/DAY5-PLAN.md) 第 1 节，
      原理见 [docs/ISSUES.md #12](./docs/ISSUES.md)
- [ ] **确认 Vercel 环境变量**（`DATABASE_URL` / `DATABASE_AUTH_TOKEN` / `AUTH_SECRET`）：
      本次会话未确认；取值命令与判断方式见 [docs/DAY5-PLAN.md](./docs/DAY5-PLAN.md) 第 3.1 节
- [ ] **`lib`、`scripts`、`prisma` 的属主仍是外来账号 `Rebirth\CodexSandboxOffline`**：
      沙箱会话是靠「完全权限」绕过写入限制的；建议在管理员终端执行
      `takeown /F <目录> /R /D Y` + `icacls <目录> /grant "%USERNAME%:(OI)(CI)F" /T /C`
      把属主改回自己，详见 [docs/ISSUES.md](./docs/ISSUES.md) 的 #11
- [ ] 清理临时排查脚本（沙箱内删不掉，`.gitignore` 已排除）：
      `Remove-Item scripts\tmp-*.mjs, scripts\tmp-*.ps1 -Force` 与 `Remove-Item .tmp -Recurse -Force`
- [ ] 配好 GitHub OAuth App 凭据后，补一次 GitHub 登录的浏览器手测
- [ ] `DECISIONS.md` 第 2 节仍写"线上用 PostgreSQL"，与第 5 节的 Turso 决策并存；按当前决定**暂不改**（已加阅读提示）
- [ ] 若 `dev.db` 或 `.next` 再次出现"拒绝访问 / `os error 5` / `SQLITE_READONLY`"，
      按 [docs/ISSUES.md](./docs/ISSUES.md) 的 #1 与 #11 处理
- [ ] 若 `npm run build` 报 `failed to create junction point`，打开 Windows 开发者模式或用管理员终端
      （[ISSUES #9](./docs/ISSUES.md)）
- [ ] 公网开放前补限流（注册与新增书签都还没有速率限制，见 [DECISIONS.md 第 10 节](./DECISIONS.md)）
