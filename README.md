# 书签管理器

极简书签管理器 MVP：快速保存、组织、搜索书签。

## 技术栈

- **框架**：Next.js 16 (App Router) + React 19 + TypeScript
- **样式**：Tailwind CSS 4
- **数据库 / ORM**：Prisma 7 + SQLite（本地开发），PostgreSQL（线上）
- **部署**：Vercel

## 项目进度

| 阶段 | 内容 | 状态 |
| ---- | ---- | ---- |
| Day 1 | 初始化 + 部署 | ✅ 已完成 |
| Day 2 | 数据库 + ORM 配置 | ✅ 已完成 |
| Day 3 | 用户认证 | ⏳ 未开始 |
| Day 4 | 书签 CRUD | ⏳ 未开始 |
| Day 5 | UI 优化 + 部署 | ⏳ 未开始 |

详细任务清单见 [TASKS.md](./TASKS.md)，架构决策记录见 [DECISIONS.md](./DECISIONS.md)。

## Getting Started

首次运行前需要准备好数据库连接：

```bash
# 1. 安装依赖（postinstall 会自动生成 Prisma Client）
npm install

# 2. 从模板创建环境变量文件（PowerShell: Copy-Item .env.example .env）
cp .env.example .env

# 3. 应用数据库迁移
npx prisma migrate dev
```

然后启动开发服务器：

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## 线上数据库（远端 libSQL / Turso）

线上用 Turso（远端 libSQL），本地继续用 SQLite 文件。两者同为 SQLite，`prisma/migrations` 下的迁移 SQL 可以原样套用，`schema.prisma` 的 provider 不用改。

1. 在 Turso 控制台建库，拿到 `libsql://...` 地址和 token；
2. 本地 `.env` 追加这两行，然后应用迁移：

```bash
# .env
DATABASE_URL="libsql://<数据库名>-<组织名>.turso.io"
DATABASE_AUTH_TOKEN="<token>"

npm run db:migrate:remote
```

3. 在 Vercel 项目的环境变量里为 Production / Preview / Development 三个环境都配上同样这两个变量。

> **不要用 `prisma migrate deploy` 连 Turso**：Prisma CLI 的 `datasource.url` 只认引擎内置的 scheme（`file:`、`postgresql:` 等），传 `libsql://` 会直接报 `P1013: The scheme is not recognized in database URL`；当前版本的 PrismaConfig 也没有 `adapter` 字段，没法让 CLI 走 driver adapter。所以远端迁移固定用 `npm run db:migrate:remote`——它用 `@libsql/client` 直接执行迁移 SQL，并把已应用记录写进 `_applied_migrations` 表，可重复执行。

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
