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

详细文档：

- [TASKS.md](./TASKS.md) —— 任务清单与进度
- [DECISIONS.md](./DECISIONS.md) —— 架构决策记录（ADR）
- [docs/ISSUES.md](./docs/ISSUES.md) —— 踩过的坑：现象 / 根因 / 解法
- [docs/SESSION-RECORDS.md](./docs/SESSION-RECORDS.md) —— 会话过程记录

## 开始使用

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
```

打开 [http://localhost:3000](http://localhost:3000) 即可。

## 自己验证数据库链路

改完 schema、切了数据库、或者感觉"哪里不对"时，按顺序跑这四条，每条的预期结果都列出来了。

```bash
# 1. Next.js + Prisma + adapter 是否端到端通（读链路）
curl.exe http://localhost:3000/api/health
# 预期: {"ok":true,"users":1,"bookmarks":1,"tags":2}   ← 没有 {"ok":false} / 503

# 2. schema 是否合法
npx prisma validate
# 预期: The schema at prisma\schema.prisma is valid 🚀

# 3. 迁移是否已全部应用
npx prisma migrate status
# 预期: Database schema is up to date!  +  1 migration found in prisma/migrations

# 4. 读 + 写 + 关联 + 级联删除全链路（第 1 条验不到写入！）
node scripts/verify-day2-probe.mjs
# 预期: ... WRITE_OK / RELATION_OK / SEARCH_OK / CASCADE_OK ... RESULT_OK
```

关于第 4 条为什么必要：`/api/health` 只做 `count()`，**是只读的**——数据库处于只读状态时它照样返回
`ok:true`。写入、多对多关联、`onDelete: Cascade` 必须另外验。探针跑完不留任何测试数据
（开头结尾的行数应当一致）。

想用图形界面看数据：

```powershell
npx prisma studio --url "file:///D:/my_vibecoding/bookmark-manager/dev.db"
```

> 必须带 `--url "file:///..."`：Prisma 7.10.0 的 studio 用 `split("://")` 判断协议，`file:./dev.db` 不含 `://`，
> 会误报 `Prisma Studio is not supported for the "file:./dev.db" protocol`。原因与排查见 [docs/ISSUES.md](./docs/ISSUES.md) 的 #3。

## 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| `next build` 报 `EPERM ... .next\trace` 或 `os error 5` | `.next` 的属主不在你名下。管理员窗口执行 `takeown /F ".next" /R /D Y` + `icacls ".next" /grant "%USERNAME%:(OI)(CI)F" /T /C`，见 [ISSUES](./docs/ISSUES.md) 的 #1 |
| Prisma 写入报 `SQLITE_READONLY` | 同上，`dev.db` 属主/权限问题；或文件被别的进程锁着 |
| `spawn EPERM`（`next dev` / `prisma migrate status`） | 受限沙箱禁止管道子进程，在普通终端里跑，见 [ISSUES](./docs/ISSUES.md) 的 #2 |
| 纯 Node 里 import 生成的客户端报 `ERR_MODULE_NOT_FOUND: .../enums` | 生成代码用无扩展名相对导入，需注册 `scripts/prisma-esm-hook.mjs`，见 [ISSUES](./docs/ISSUES.md) 的 #4 |
| 想连 Turso 却报 `P1013` | 远端迁移固定走 `npm run db:migrate:remote`，不要用 `prisma migrate deploy`，见下节 |

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

## 目录结构

```
app/
  api/health/route.ts     数据库连通性自检接口
  generated/prisma/       Prisma 生成的客户端（.gitignore 排除，不入库）
  layout.tsx / page.tsx / globals.css
lib/prisma.ts             惰性初始化的 PrismaClient（必须用 getPrisma()）
prisma/
  schema.prisma           数据模型（认证 4 张表 + 业务 2 张表）
  migrations/             SQLite 方言迁移，远端 Turso 也直接套用
scripts/
  migrate-remote.mjs      把迁移应用到远端 libSQL（替代 prisma migrate deploy）
  verify-day2-probe.mjs   数据库读写全链路自检探针
  prisma-esm-hook.mjs     纯 Node 加载生成客户端的 ESM loader
prisma7.config.ts         Prisma 7 配置（schema / migrations / datasource.url）
docs/                     问题库与会话记录
```

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
