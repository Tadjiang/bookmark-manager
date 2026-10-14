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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
