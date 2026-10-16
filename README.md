# 书签管理器

极简书签管理器 MVP：快速保存、组织、搜索书签。

## 技术栈

- **框架**：Next.js 16 (App Router) + React 19 + TypeScript
- **样式**：Tailwind CSS 4
- **数据库 / ORM**：Prisma 7 + SQLite（本地开发）/ 远端 libSQL - Turso（线上）
- **认证**：Auth.js v5（`next-auth@beta`）—— GitHub OAuth + 邮箱密码，JWT 会话
- **部署**：Vercel

## 项目进度

| 阶段 | 内容 | 状态 |
| ---- | ---- | ---- |
| Day 1 | 初始化 + 部署 | ✅ 已完成 |
| Day 2 | 数据库 + ORM 配置 | ✅ 已完成 |
| Day 3 | 用户认证 | ✅ 已完成（GitHub 真实授权待手测） |
| Day 4 | 书签 CRUD | ⏳ 未开始 |
| Day 5 | UI 优化 + 部署 | ⏳ 未开始 |

详细文档：

- [TASKS.md](./TASKS.md) —— 任务清单与进度
- [DECISIONS.md](./DECISIONS.md) —— 架构决策记录（ADR）
- [docs/DAY3-VERIFICATION.md](./docs/DAY3-VERIFICATION.md) —— 认证的验证结果、手测清单与排错对照表
- [docs/DAY4-PLAN.md](./docs/DAY4-PLAN.md) —— Day 4（书签 CRUD）的规划与待定问题
- [docs/ISSUES.md](./docs/ISSUES.md) —— 踩过的坑：现象 / 根因 / 解法
- [docs/SESSION-RECORDS.md](./docs/SESSION-RECORDS.md) —— 会话过程记录

## 开始使用

首次运行前需要准备好数据库连接与认证密钥：

```bash
# 1. 安装依赖（postinstall 会自动生成 Prisma Client）
npm install

# 2. 从模板创建环境变量文件（PowerShell: Copy-Item .env.example .env）
cp .env.example .env

# 3. 生成 AUTH_SECRET 并填进 .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 4. 应用数据库迁移
npx prisma migrate dev
```

`.env` 需要的变量（`.env.example` 里有注释版）：

```dotenv
DATABASE_URL="file:./dev.db"
AUTH_SECRET="<上面生成的>"
AUTH_GITHUB_ID=""        # 可选：不填则只保留邮箱密码登录
AUTH_GITHUB_SECRET=""
AUTH_TRUST_HOST="true"   # 本地/自建部署需要；Vercel 上不需要
```

想启用 GitHub 登录：在 https://github.com/settings/developers 新建 OAuth App，
**Authorization callback URL** 填 `http://localhost:3000/api/auth/callback/github`，
把 Client ID / Secret 填进 `.env` 后重启 dev server。

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

# 3. 迁移是否已全部应用（仅本地库）
npx prisma migrate status
# 预期: Database schema is up to date!  +  1 migration found in prisma/migrations

# 4. 读 + 写 + 关联 + 级联删除全链路（第 1 条验不到写入！）
npm run db:verify:local
# 预期: ... WRITE_OK / RELATION_OK / SEARCH_OK / CASCADE_OK ... RESULT_OK

# 5. 远端库（Turso）同样走一遍，并额外对账迁移记录
npm run db:verify:remote
# 预期: 连得上 / schema 齐全 / 迁移对账一致 / 写入 / 级联 / 行数回到基线 ... RESULT_OK
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

## 自己验证认证链路

改动认证相关代码后按顺序跑这几条（前两条不需要数据库或服务）：

```bash
# 1. 安全护栏：open redirect、会话字段白名单（密码哈希不得进 JWT）、错误码文案
node scripts/verify-auth-guards.mjs
# 预期: 52 项 PASS + RESULT_OK

# 2. adapter 契约：官方 @auth/prisma-adapter 的 14 个方法在 Prisma 7 上是否真跑通
node scripts/verify-auth-adapter.mjs      # 需可写库，先停 dev server
# 预期: 19 项 PASS + RESULT_OK

# 3. 邮箱+密码：注册入库、密码校验、各失败分支
node scripts/verify-auth-probe.mjs        # 同上
# 预期: 16 项 PASS + RESULT_OK

# 4. HTTP 端到端：登录 → cookie → 会话解出 user.id → 受保护路由放行 → 登出 → 未登录被拦
npm run dev                               # 另开窗口
node scripts/verify-auth-session.mjs
# 预期: 全部 PASS + RESULT_OK
```

每条命令的详细说明、预期输出与排错对照表见 [docs/DAY3-VERIFICATION.md](./docs/DAY3-VERIFICATION.md)。

## 自己验证书签 CRUD

改动书签相关代码后按顺序跑这两条（第一条不需要数据库，第二条需要可写库，跑之前先停 dev server）：

```bash
# 1. 输入校验 + 标签归一化 + 数据访问层的静态护栏（不碰数据库）
node scripts/verify-bookmark-input.mjs
# 预期: 48 项 PASS + RESULT_OK

# 2. 越权 / 标签幂等 / 搜索 / 筛选 AND / 关联清理（会写库，跑完自动清干净）
node scripts/verify-bookmarks-probe.mjs
# 预期: 23 项 PASS + RESULT_OK，且 BASELINE 与 FINAL 的行数一致
```

第 2 条**没有 import 数据访问层本身**（`lib/bookmarks.ts` 依赖 `@/auth` 与 `next/navigation`，
纯 Node 下加载不了），它验的是"带 `userId` 的查询条件真的拦得住"；
"DAL 里每处真的都带了 `userId`"由第 1 条的静态护栏来守。两者的分工与**覆盖边界**写在
[docs/DAY4-VERIFICATION.md](./docs/DAY4-VERIFICATION.md) 第 3 节，手测清单在第 4 节。

## 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 构建报 `Route segment config "dynamic" is not compatible with nextConfig.cacheComponents` | 删掉该段配置，改为用 `<Suspense>` 包住读会话/查库的部分，见 [ISSUES](./docs/ISSUES.md) 的 #7 |
| 构建报 `uncached or runtime data during prerendering` | 同上：`auth()`、`searchParams`、数据库查询都属请求期数据，必须在 `<Suspense>` 内 |
| 构建报 `Both middleware file ... and proxy file ... are detected` | Next 16 已把 `middleware` 改名 `proxy`，删掉 `middleware.ts`，见 [ISSUES](./docs/ISSUES.md) 的 #8 |
| 构建报 `failed to create junction point ... os error 5` | 打开 Windows「开发者模式」，或用管理员终端构建，见 [ISSUES](./docs/ISSUES.md) 的 #9 |
| `next build` 报 `EPERM ... .next\trace` 或 `os error 5` | `.next` 的属主不在你名下。管理员窗口执行 `takeown /F ".next" /R /D Y` + `icacls ".next" /grant "%USERNAME%:(OI)(CI)F" /T /C`，见 [ISSUES](./docs/ISSUES.md) 的 #1 |
| Prisma 写入报 `SQLITE_READONLY` | 先看 `dev.db` 有没有 `Low` 完整性标记（受限进程是低完整性级别时写不了无标记对象），见 [ISSUES](./docs/ISSUES.md) 的 #11；属主不在你名下则见 #1；也可能只是文件被别的进程锁着 |
| `Access to the path ... is denied`，但 `icacls` 看权限明明是够的 | 进程完整性级别与对象标记不匹配（MIC 在 DACL 之后判定，`icacls` 列不出来），见 [ISSUES](./docs/ISSUES.md) 的 #11 |
| `git add` 报 `.git/index.lock: Permission denied` | 同上：缺 `.git/` 目录的完整性标记，见 [ISSUES](./docs/ISSUES.md) 的 #11 |
| `spawn EPERM`（`next dev` / `prisma migrate status`） | 受限沙箱禁止 `fork`/管道子进程，在普通终端里跑，见 [ISSUES](./docs/ISSUES.md) 的 #2、#10 |
| 纯 Node 里 import 生成的客户端报 `ERR_MODULE_NOT_FOUND: .../enums` | 生成代码用无扩展名相对导入，需注册 `scripts/prisma-esm-hook.mjs`，见 [ISSUES](./docs/ISSUES.md) 的 #4 |
| 登录后跳到了外部站点 / 想确认跳转是否安全 | 站内跳转由 `lib/safe-redirect.ts` 白名单控制，护栏探针里有回归断言 |
| 点了 GitHub 登录跳 `/api/auth/error?error=Configuration` | 出网不通或 GitHub 凭据无效；回调地址必须是 `http://localhost:3000/api/auth/callback/github` |
| 想连 Turso 却报 `P1013` | 远端迁移固定走 `npm run db:migrate:remote`，不要用 `prisma migrate deploy`，见下节 |
| 部署好了但 `xxx.vercel.app` 打不开（`curl: (28)` / `curl: (35) Connection was reset`） | 国内对 `*.vercel.app` 有 DNS 污染 + SNI 阻断，**不是你的代码问题**。绑自定义域名解决，见下节与 [ISSUES #12](./docs/ISSUES.md) |
| 线上 `/api/health` 返回 `{"ok":false}` + 503 | Vercel 环境变量没配或没生效；注意"部署成功"证明不了变量存在，改完要手动 Redeploy |
| 线上点 GitHub 登录跳 `?error=Configuration` | OAuth App 的 callback URL 没加线上域名 |

## 线上数据库（远端 libSQL / Turso）

线上用 Turso（远端 libSQL），本地继续用 SQLite 文件。两者同为 SQLite，`prisma/migrations` 下的迁移 SQL 可以原样套用，`schema.prisma` 的 provider 不用改。

### 变量怎么分：本地一套，Vercel 一套

| 位置 | 变量 | 值 | 谁在用 |
| --- | --- | --- | --- |
| 本地 `.env` | `DATABASE_URL` | `file:./dev.db` | 应用（`npm run dev`）、`prisma migrate dev`、`prisma studio` |
| 本地 `.env` | `REMOTE_DATABASE_URL`<br>`REMOTE_DATABASE_AUTH_TOKEN` | Turso 地址 + token | **只有** `db:migrate:remote` / `db:verify:remote` |
| Vercel 环境变量 | `DATABASE_URL`<br>`DATABASE_AUTH_TOKEN` | Turso 地址 + token | 线上应用（`lib/prisma.ts` 读这两个） |

> **不要把 Turso 地址写进本地的 `DATABASE_URL`**：那样 `npm run dev` 会直接读写**线上数据**，
> 而且 `prisma migrate dev` / `prisma studio` 会因为 CLI 不认 `libsql://` 而失效（`P1013`）。
> 两处用途分开命名之后，本地永远是本地库，对远端的操作必须是显式的。

### 步骤

**1. 建库，拿到地址与 token**（二选一）

```bash
# 方式 A：Turso CLI
turso db create bookmark-manager
turso db show bookmark-manager --url        # → libsql://bookmark-manager-<组织名>.turso.io
turso db tokens create bookmark-manager     # → 一串 token，只显示这一次

# 方式 B：Turso 控制台 → 选中数据库 → 「URL」；「Tokens」→ Create Token
```

**2. 本地 `.env` 追加这两行**（`.env` 不入库）

```
REMOTE_DATABASE_URL="libsql://<数据库名>-<组织名>.turso.io"
REMOTE_DATABASE_AUTH_TOKEN="<token>"
```

**3. 应用迁移，然后自检**

```bash
npm run db:migrate:remote
# 预期: 待应用 N 个迁移 → ✓ <迁移名> → 完成

npm run db:verify:remote
# 预期: RESULT_OK —— 连得上 / schema 齐全 / 迁移对账一致 /
#        写入+读回关联 / 搜索命中 / 级联清理 / 行数回到基线
```

`db:verify:remote` 会**写远端库**（用独立邮箱建一个临时用户，跑完即删），
证明的是"能写"这件事——`migrate:remote` 打印成功只代表建表 SQL 没报错。

**4. 在 Vercel 配环境变量**

项目 → Settings → Environment Variables，为 **Production / Preview / Development** 三个环境都配上：

| Name | Value |
| --- | --- |
| `DATABASE_URL` | `libsql://<数据库名>-<组织名>.turso.io` |
| `DATABASE_AUTH_TOKEN` | 上一步的 token |
| `AUTH_SECRET` | 本地 `AUTH_SECRET` 的值（生成方式见 `.env.example`） |

配完**手动 Redeploy 一次**——改环境变量不会自动重建。

> **不要用 `prisma migrate deploy` 连 Turso**：Prisma CLI 的 `datasource.url` 只认引擎内置的 scheme（`file:`、`postgresql:` 等），传 `libsql://` 会直接报 `P1013: The scheme is not recognized in database URL`；当前版本的 PrismaConfig 也没有 `adapter` 字段，没法让 CLI 走 driver adapter。所以远端迁移固定用 `npm run db:migrate:remote`——它用 `@libsql/client` 直接执行迁移 SQL，并把已应用记录写进 `_applied_migrations` 表（带 checksum 校验，迁移文件被改动过会被拒绝执行），可重复运行。

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## 目录结构

```
auth.ts                   Auth.js 配置（GitHub + Credentials、JWT 会话、惰性 PrismaAdapter）
proxy.ts                  受保护路由（Next 16 的 proxy，替代已弃用的 middleware）
app/
  actions/auth.ts         登录 / GitHub 登录 / 注册 / 登出 四个 Server Action
  actions/bookmarks.ts    书签 创建 / 更新 / 删除 三个 Server Action（写完调 refresh()）
  auth-forms.tsx          客户端表单（useActionState 展示错误）
  api/auth/[...nextauth]/ Auth.js 路由处理器
  api/health/route.ts     数据库连通性自检接口
  signin/ register/       登录页 / 注册页（静态外壳 + Suspense 结构）
  dashboard/page.tsx      受保护页面（外壳 + 两层 Suspense）
  dashboard/bookmark-list.tsx          列表（await searchParams + 查库）
  dashboard/bookmark-item.tsx          单条展示（服务端组件）
  dashboard/bookmark-form.tsx          新增/编辑共用的表单
  dashboard/bookmark-item-actions.tsx  编辑展开 / 删除入口
  dashboard/delete-button.tsx          删除二次确认
  dashboard/search-bar.tsx             搜索（300ms 防抖）+ 标签筛选
  dashboard/form-ui.tsx                表单共用样式与错误组件
  generated/prisma/       Prisma 生成的客户端（.gitignore 排除，不入库）
  layout.tsx / page.tsx / globals.css
lib/
  prisma.ts               惰性初始化的 PrismaClient（必须用 getPrisma()）
  bookmarks.ts            书签数据访问层（每个函数第一件事就是取会话）
  bookmark-input.ts       输入校验与标签归一化（纯函数，可脱离数据库测）
  redirect-error.ts       识别 NEXT_REDIRECT，避免被 catch 吞掉
  password.ts             scrypt 密码哈希（零依赖）
  credentials.ts          邮箱归一化 + 密码校验
  auth-config.ts          GitHub 是否启用的判定
  auth-errors.ts          Auth.js 错误码 → 中文文案
  safe-redirect.ts        站内跳转白名单（防 open redirect）
types/next-auth.d.ts      给 session.user 补 id
prisma/
  schema.prisma           数据模型（认证 4 张表 + 业务 2 张表）
  migrations/             SQLite 方言迁移，远端 Turso 也直接套用
scripts/
  migrate-remote.mjs      把迁移应用到远端 libSQL（替代 prisma migrate deploy）
  verify-remote-db.mjs    远端库自检（连接 / schema / 迁移对账 / 写入探针）
  prisma-esm-hook.mjs     纯 Node 加载生成客户端 / 解析 @ 别名的 ESM loader
  lib/db-url.mjs          探针共用的连接串解析（统一转绝对路径）
  verify-day2-probe.mjs   数据库读写全链路自检
  verify-auth-guards.mjs  认证安全护栏自检
  verify-auth-adapter.mjs Prisma adapter 契约自检
  verify-auth-probe.mjs   邮箱+密码链路自检
  verify-auth-session.mjs HTTP 端到端会话链路自检
  verify-bookmark-input.mjs    书签输入校验 / 标签归一化 / 静态护栏自检
  verify-bookmarks-probe.mjs   书签越权 / 搜索 / 筛选 / 关联清理自检
prisma7.config.ts         Prisma 7 配置（schema / migrations / datasource.url）
docs/                     问题库、会话记录、Day 3 / Day 4 验证文档
```

## 部署到 Vercel

项目已上线（`Status: Ready` / `Environment: Production`），但**必须绑一个自定义域名**才能在国内访问——
`*.vercel.app` 被 DNS 污染 + SNI 阻断，且 Vercel 的服务本身没被墙。原理与诊断过程见
[docs/ISSUES.md](./docs/ISSUES.md) 的 #12，决策见 [DECISIONS.md](./DECISIONS.md) 第 11 节。

### 1. 环境变量

项目 → Settings → Environment Variables，**Production / Preview / Development 三个环境都勾上**：

| Name | Value |
| --- | --- |
| `DATABASE_URL` | Turso 地址（= 本地 `.env` 里的 `REMOTE_DATABASE_URL`，**别填成本地的 `file:`**） |
| `DATABASE_AUTH_TOKEN` | 本地 `.env` 里的 `REMOTE_DATABASE_AUTH_TOKEN` |
| `AUTH_SECRET` | 本地 `.env` 里的 `AUTH_SECRET` |

> **不要设 `AUTH_TRUST_HOST`**：那是本地/自建用的，Vercel 上 Auth.js 会自己识别域名。
>
> 改完环境变量必须**手动 Redeploy**（Deployments → ⋯ → Redeploy），它在部署时注入、不会自动生效。
>
> 注意：本项目**构建期不需要数据库凭据**（客户端惰性初始化），所以"部署成功"**证明不了**环境变量配好了——
> 缺变量只会在请求期退化成 `/api/health` 返回 503。判断方式就是打这个接口看 `ok` 字段。

### 2. 绑自定义域名

1. 项目 → Settings → Domains → Add，填域名（建议先用子域，如 `bookmarks.example.com`）；
2. 到域名商处按提示加 DNS 记录：
   - 子域：`CNAME` → `cname.vercel-dns.com`
   - 主域（apex）：`A` 记录按 Vercel 提示（通常 `76.76.21.21`），或用它给的 ALIAS/ANAME
3. 等 Vercel 的 Domains 页面显示 `Valid Configuration`（几分钟到几小时），然后验证：
   ```powershell
   curl.exe -i https://bookmarks.example.com/api/health
   # 预期: HTTP/2 200 + {"ok":true}
   ```

> **不需要 ICP 备案**：备案只针对服务器在中国大陆的网站，Vercel 在境外。
>
> 线上 `/api/health` **刻意只返回 `{"ok":true}`**，不带统计数字（避免公网泄露数据量），
> 所以别指望用它区分本地库和远端库——只看 `ok`。

### 3. GitHub 登录

要让线上也能用 GitHub 登录，去 https://github.com/settings/developers 的 OAuth App，
在 **Authorization callback URL** 里追加一行 `https://bookmarks.example.com/api/auth/callback/github`
（localhost 那条保留）。不改的话线上点 GitHub 登录会跳 `?error=Configuration`。

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
