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
- [ ] 用户认证（登录/注册/登出）
- [ ] 添加书签（URL + 标题 + 描述 + 分类标签）
- [ ] 书签列表展示
- [ ] 搜索书签（按标题/URL）
- [ ] 删除书签
- [ ] 基础 UI（响应式设计）

### P1 - 功能增强（第二阶段）
- [ ] 编辑书签
- [ ] 按分类筛选
- [ ] 书签导入（HTML 格式）
- [ ] 书签导出（HTML 格式）
- [ ] 暗黑模式切换
- [ ] 分页 / 无限滚动

### P2 - 高级功能（第三阶段）
- [ ] 书签收藏夹
- [ ] 分享功能
- [ ] 书签统计面板
- [ ] 浏览器扩展
- [ ] 全文搜索优化
- [ ] 团队协作

## 当前进度

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

### 🔐 Day 3 - 用户认证
- [ ] **待定：登录方式走 GitHub OAuth、邮箱+密码，还是两者都要**（决定要不要加 bcrypt 之类依赖、以及 `.env` 密钥）
- [ ] 安装 NextAuth.js（Auth.js）
- [ ] 配置认证提供商（GitHub OAuth / 邮箱）
- [ ] 实现登录页面
- [ ] 实现注册页面
- [ ] 实现登出功能
- [ ] 添加受保护路由

> 动手前先看 [DECISIONS.md 第 4 节](./DECISIONS.md)：`PrismaAdapter(...)` **不能写在模块顶层**，
> 否则会重演 Day 2 那次 Vercel 构建期缺 `DATABASE_URL` 导致的构建失败。
> 认证用的 4 张表 Day 2 已按 Auth.js 约定建好，正常情况下 **Day 3 不需要新增迁移**。

### 📌 Day 4 - 书签 CRUD
- [ ] API 路由：POST /api/bookmarks（创建）
- [ ] API 路由：GET /api/bookmarks（列表）
- [ ] API 路由：GET /api/bookmarks/:id（详情）
- [ ] API 路由：PUT /api/bookmarks/:id（更新）
- [ ] API 路由：DELETE /api/bookmarks/:id（删除）
- [ ] UI：书签表单
- [ ] UI：书签列表
- [ ] UI：搜索功能

### 🎨 Day 5 - UI 优化 + 部署
- [ ] 完善样式
- [ ] 响应式设计测试
- [ ] 错误处理 + 加载状态
- [ ] 部署到 Vercel
- [ ] 配置线上数据库（远端 libSQL / Turso，`npm run db:migrate:remote`；PostgreSQL 推迟）

## 遗留待办

- [ ] 删除 `scripts/tmp-grant-acl.ps1`（一次性权限修复脚本，内容已清空，沙箱内删不掉）
- [ ] 决定 `scripts/verify-day2-probe.mjs`、`scripts/prisma-esm-hook.mjs` 的去留（当前未跟踪，可提交也可删除）
- [ ] `DECISIONS.md` 第 2 节仍写"线上用 PostgreSQL"，与第 5 节的 Turso 决策并存；按当前决定**暂不改**（已加阅读提示）
- [ ] 若 `dev.db` 或 `.next` 再次出现"拒绝访问 / `os error 5`"，按 [docs/ISSUES.md](./docs/ISSUES.md) 的 #1 处理
