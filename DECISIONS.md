# 架构决策记录（ADR）

## 1. 为什么选 Next.js + TypeScript？

### 背景
需要快速构建一个全栈应用，同时保证代码质量和可维护性。

### 决策
- ✅ Next.js 16 (App Router)
- ✅ TypeScript 5
- ✅ React 19

### 理由
1. **开发效率高**
   - App Router 基于文件系统自动生成路由，无需额外配置
   - API 路由可与页面在同一项目中，减少部署复杂度
   - 开箱即用的中间件、认证支持

2. **全栈框架**
   - 前端 + 后端 + 数据库在一个项目里，减少架构复杂性
   - Server Components 默认支持，性能更优
   - 内置 Image Optimization、Font Optimization

3. **TypeScript 带来的好处**
   - 类型检查减少运行时错误
   - IDE 自动补全，开发体验好
   - 重构更安全

4. **生态成熟**
   - 与 Vercel 深度集成（无缝部署）
   - 社区庞大，库和解决方案丰富
   - 性能优化成熟

### 替代方案对比
| 框架 | 全栈能力 | 学习曲线 | 部署难度 | 选择 |
|-----|--------|--------|--------|------|
| Next.js | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 很简单 | ✅ |
| Remix | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 简单 | - |
| SvelteKit | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 简单 | - |
| Express + React | ⭐⭐ | ⭐⭐ | 复杂 | - |

---

## 2. 为什么本地用 SQLite，线上用 PostgreSQL？

### 背景
需要选择数据库方案，需要在开发体验和生产稳定性之间平衡。

### 决策
- ✅ **开发环境**：SQLite（本地文件）
- ✅ **生产环境**：PostgreSQL（云数据库）
- ✅ **ORM**：Prisma（统一接口）

### 理由

#### SQLite 用于本地开发
1. **零配置**
   - 无需安装数据库服务
   - 一个文件即可存储所有数据
   - 开箱即用

2. **开发体验优秀**
   - 启动快速
   - 调试方便
   - 数据库文件不入库（`dev.db` 已加入 `.gitignore`，只提交迁移脚本）

3. **成本低**
   - 免费、开源
   - 无依赖

#### PostgreSQL 用于生产
1. **生产级可靠性**
   - 支持 ACID 事务
   - 支持并发连接
   - 完整的日志和备份机制

2. **扩展能力**
   - 支持大规模数据
   - 支持复杂查询优化
   - 支持行级安全（RLS）

3. **云数据库友好**
   - Vercel Postgres / Railway / Supabase 原生支持
   - 一键部署，自动备份
   - 成本可控

#### 为什么不用其他方案？
- ❌ MySQL：生态不如 PostgreSQL，Prisma 支持差
- ❌ 生产也用 SQLite：无法支持并发、无自动备份、难以扩展
- ❌ MongoDB：对于结构化数据（书签）不是最优，关系查询复杂

### Prisma 的关键作用
统一开发和生产的 ORM 接口：
```prisma
// 相同的 schema 和查询逻辑
// 自动支持 SQLite 和 PostgreSQL
model Bookmark {
  id    Int     @id @default(autoincrement())
  title String
  url   String
}
```

**迁移策略**（2026-10-14 修正）：

原先写的"同一套迁移脚本在 SQLite 和 PostgreSQL 两端运行"是行不通的，原因有两点：

1. `datasource.provider` 只能有一个值，无法同时支持两种数据库；
2. `prisma migrate deploy` 是直接执行 `prisma/migrations/` 下的 SQL 文件，而 `migrate dev` 在 SQLite 上生成的是 SQLite 方言（`INTEGER PRIMARY KEY AUTOINCREMENT`、`PRAGMA` 等），在 PostgreSQL 上会直接语法报错。

因此实际策略是：

1. 本地开发：`prisma migrate dev`，走 SQLite；
2. 上线切换：用 `prisma migrate diff --from-empty --to-schema-datamodel` 针对 PostgreSQL 生成一份 baseline，此后以 PostgreSQL 为唯一数据源，本地开发也指向同一个引擎（例如云端 dev 分支），避免两套迁移历史长期分叉。

**注意**：这套双库方案只在"开发 → 上线"切换时用一次。切换之后如果还想同时维护 SQLite 和 PostgreSQL 两套迁移，成本会很高，不建议。

---

## 3. 为什么先用 Vercel 部署？

### 背景
MVP 阶段需要快速上线，同时保证稳定性和成本效益。

### 决策
- ✅ 部署平台：Vercel
- ✅ 数据库：Vercel Postgres / Supabase
- ✅ 认证：NextAuth.js

### 理由

#### Vercel 的优势
1. **Next.js 官方推荐**
   - 由 Next.js 创建者运营
   - 深度集成，性能最优
   - 自动 CI/CD（push 即部署）

2. **无需运维**
   - 零配置部署
   - 自动 HTTPS
   - 自动扩展
   - 无需管理服务器

3. **开发友好**
   - GitHub 集成（自动部署）
   - 预览环境（每个 PR 自动部署）
   - Vercel Analytics 内置

4. **成本低**
   - 免费额度适合 MVP
   - 按使用量计费
   - 比 AWS/GCP 简单便宜

5. **生态支持**
   - Vercel Postgres / Supabase 无缝集成
   - NextAuth.js 官方支持
   - 第三方库广泛支持

#### 替代方案对比
| 平台 | 部署难度 | 成本 | 运维 | 学习曲线 | 选择 |
|-----|--------|------|------|--------|------|
| Vercel | 很简单 | 很便宜 | 无 | ⭐ | ✅ |
| Railway | 简单 | 便宜 | 少 | ⭐⭐ | - |
| AWS | 复杂 | 中等 | 多 | ⭐⭐⭐⭐ | - |
| Docker + VPS | 复杂 | 便宜 | 多 | ⭐⭐⭐⭐ | - |

#### 为什么不选其他？
- ❌ Docker + VPS：对 MVP 来说运维负担重
- ❌ AWS：免费额度复杂，学习成本高
- ❌ Netlify：只支持静态网站和 Functions（CORS 限制），不适合全栈

### 迁移路径
```
MVP 阶段        → 用户增长      → 规模化
Vercel Deploy   → Railway/Render  → 自建或多云
单一数据库      → 只读副本       → 分库分表
Free Plan       → Pro Plan        → 按需付费
```

---

## 总结

| 决策 | 选择 | 核心原因 |
|-----|-----|--------|
| **框架** | Next.js + TS | 全栈一体、开发效率、生态成熟 |
| **DB** | SQLite 文件 (dev) + 远端 libSQL (prod)；PG 待定 | 开发无配置 + 线上零重写（见第 5 节，PG 推迟） |
| **ORM** | Prisma | 统一接口、自动迁移、类型安全 |
| **部署** | Vercel | 零运维、官方推荐、成本低 |

这些决策优先考虑 **MVP 阶段的快速迭代**，后续可根据业务增长灵活调整。

---

## 4. Prisma 7 的实际形态（2026-10-14 补充）

### 背景

Day 2 落地时发现，Prisma 7 与培训数据里的 Prisma 6 有大量破坏性差异，且 npm 上的版本标签存在陷阱。记录下来，避免后续重复踩坑。

### 关键差异

| 事项 | Prisma 6 的写法 | Prisma 7 的实际要求 |
|-----|---------------|------------------|
| 安装 | `npm i -D prisma` 即可 | npm 的 `latest` 标签指向 **8.0.0-rc 平台 CLI**，必须显式 `prisma@7.10.0` |
| 配置文件 | `package.json` 的 `prisma` 字段 或 `prisma.config.ts` | `prisma7.config.ts`（文件名带主版本号） |
| `.env` 加载 | 自动加载 | **不自动加载**，需 `import "dotenv/config"` + `dotenv` 依赖 |
| 连接串位置 | `datasource` 块里的 `url` | 移到 `prisma7.config.ts` 的 `datasource.url`，schema 里只留 `provider` |
| 查询引擎 | Rust 引擎内置 | **移除**，必须显式传 driver adapter |
| 生成器 | `prisma-client-js` | `prisma-client`，**必须**指定 `output` |
| 客户端导入 | `@prisma/client` | 生成的目录，如 `@/app/generated/prisma/client` |

### 两个环境相关的坑

1. **driver adapter 的选择**：`@prisma/adapter-better-sqlite3` 依赖 `better-sqlite3`，其预编译二进制需从 GitHub 下载（本机超时），回退本地编译又需要 Python（本机不可用）。改用 `@prisma/adapter-libsql`，其原生二进制以 npm 包（`@libsql/win32-x64-msvc`）分发，走 registry 即可装上。
2. **`prisma dev`（本地 Prisma Postgres）不可用**：该子命令在运行时通过 npm 动态下载 `@prisma/cli-dev`，本机环境无法完成，且官方文档标注本地栈尚不支持 Windows。因此本地开发固定用 SQLite 文件。

### 为什么把 NextAuth 的表一并建好

`User` / `Account` / `Session` / `VerificationToken` 的字段名是 Auth.js Prisma 适配器约定好的，不能随意改。Day 2 一次建好，Day 3 接认证时就不用再产生一次迁移；`User.passwordHash` 设为可空，同时兼容 OAuth 与邮箱密码两种登录方式。

### 数据库客户端必须惰性初始化（2026-10-14 修正）

**现象**：Day 2 推送到 Vercel 后构建失败，报错是 `缺少环境变量 DATABASE_URL`，堆栈指向 `lib/prisma.ts` 的模块顶层。

**原因**：`next build` 在"收集路由信息"阶段会求值被引用模块的顶层代码。`.env` 不入库，Vercel 构建期也没有注入 `DATABASE_URL`，于是顶层 `throw` 直接中断构建。Day 1 没有 Prisma，所以同一套配置部署正常。

**决定**：`lib/prisma.ts` 只导出 `getPrisma()`，首次真正查询时才创建客户端并读取环境变量。

- 构建期不再需要任何数据库凭据；线上万一缺变量，退化成 `/api/health` 返回 503，而不是构建红灯。
- 调用方必须在函数体内调用 `getPrisma()`，不要写 `import { prisma }`——那个导出已经不存在，写错会直接类型报错。
- Day 3 接 NextAuth 时注意同样的问题：`PrismaAdapter(...)` 不要写在模块顶层。

**连接串的两种形态**：本地 `file:./dev.db`；线上远端 libSQL（Turso）为 `libsql://...` + `DATABASE_AUTH_TOKEN`。两者共用 `@prisma/adapter-libsql`，schema provider 和已有迁移都不用动，这是当前最省的上线路径。

---

## 5. 线上先接远端 libSQL（Turso），暂不上 PostgreSQL（2026-10-14）

### 背景

第 2 节的计划是"上线时切 PostgreSQL"。B1 落地前实测发现两件事，让这个计划需要重新排期：

1. **Prisma CLI 连不上远端 libSQL**：`datasource.url` 只认引擎内置 scheme，传 `libsql://` 直接报 `P1013: The scheme is not recognized in database URL`；`@prisma/config` 的 `PrismaConfig` 没有 `adapter` 字段，`migrate deploy` 也没有 `--adapter` 参数，所以没法让 CLI 走 driver adapter。
2. **切 PostgreSQL 的成本集中在迁移史**：现有 `prisma/migrations/` 是 SQLite 方言（`migration_lock.toml` 也写着 `provider = "sqlite"`），必须用 `migrate diff` 重做 baseline；而且按第 2 节的原则，切了 PG 之后本地开发也得指向同一个引擎，否则长期维护两套迁移历史。

### 决策

线上先用 **Turso（远端 libSQL）**，本地继续用 SQLite 文件；PostgreSQL 推迟到真正需要时再切。

### 理由

- **零重写**：schema 的 `provider = "sqlite"` 不变，`@prisma/adapter-libsql` 不变，已有的 SQLite 方言迁移 SQL 可以直接套到 Turso（Turso 就是 SQLite）。运行时只是把 `{ url }` 换成 `{ url, authToken }`。
- **迁移史只有一套**：本地 `prisma migrate dev` 写出的迁移，用 `npm run db:migrate:remote` 原样应用到远端，不需要为线上单独维护一份 baseline。
- **Day 3 / Day 4 的成果能在 Vercel 预览环境真跑**：认证会话落库、书签读写都能在部署后立刻验证，而不是把风险堆到 Day 5。

### 代价与遗留

- **远端迁移不走 Prisma CLI**：`scripts/migrate-remote.mjs` 用 `@libsql/client` 执行 `prisma/migrations/*/migration.sql`，已应用记录写在 `_applied_migrations` 表（自建，与 Prisma 的 `_prisma_migrations` 无关，因为 CLI 不会碰这个库）。脚本对同一迁移的 checksum 做了校验，改动过的迁移会被拒绝执行。
- **并发 / 事务能力弱于 PostgreSQL**：书签管理器的 MVP 阶段够用；一旦需要复杂事务、并发写入或全文检索，再按第 2 节的方式切 PG（届时 `migration_lock.toml` 与迁移史需要整体重做一次）。
