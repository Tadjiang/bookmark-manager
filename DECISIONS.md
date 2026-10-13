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
   - 易于版本控制（sqlite.db 可提交）

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

**迁移策略**：
1. 本地开发：`prisma migrate dev`（生成 SQLite 迁移）
2. 线上部署：`prisma migrate deploy`（同样的迁移脚本在 PostgreSQL 运行）

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
| **DB** | SQLite (dev) + PG (prod) | 开发无配置 + 生产可靠 |
| **ORM** | Prisma | 统一接口、自动迁移、类型安全 |
| **部署** | Vercel | 零运维、官方推荐、成本低 |

这些决策优先考虑 **MVP 阶段的快速迭代**，后续可根据业务增长灵活调整。
