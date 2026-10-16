# Day 3 验证记录与步骤

> 2026-10-15 起。记录 Day 3（用户认证）的验证结果、仍需人工完成的部分、以及排错要点。
> 背景见 [SESSION-RECORDS.md](./SESSION-RECORDS.md)，踩坑记录见 [ISSUES.md](./ISSUES.md)。

## 当前状态：自动化部分已全部通过，只剩两件必须人工做的事

| 验证项 | 结果 | 证据 |
| --- | --- | --- |
| `eslint` | ✅ | exit 0 |
| `tsc --noEmit` | ✅ | exit 0 |
| 安全护栏探针（52 项断言） | ✅ | `RESULT_OK`（会话内直接跑，不需要库/服务） |
| adapter 契约探针（19 项） | ✅ | `RESULT_OK`，含 `linkAccount` / 复合唯一键 / 级联删除 |
| 邮箱+密码探针（16 项） | ✅ | `RESULT_OK`，含三种邮箱写法、四个拒绝分支、数据自清理 |
| HTTP 会话探针（dev） | ✅ | `RESULT_OK`（登录→cookie→会话解出 user.id→受保护路由放行→登出→未登录被拦） |
| HTTP 会话探针（**生产构建**） | ✅ | 对 `next build` 产物再跑一遍，同样 `RESULT_OK` |
| 生产构建 | ✅ | `npm run build` exit 0；`/`、`/dashboard`、`/register`、`/signin` 为 Partial Prerender，`/api/auth/[...nextauth]`、`/api/health` 为动态，proxy 已识别 |
| GitHub provider 条件注册 | ✅ | 有凭据：`providers` 含 `github`+`credentials`、登录页显示 GitHub 按钮；无凭据：只剩 `credentials`、按钮隐藏并给出提示 |
| Day 2 回归 | ✅ | `verify-day2-probe.mjs` `RESULT_OK`，`/api/health` 正常 |
| **GitHub 真实授权往返** | ⏳ 需你完成 | 本会话出网被禁（连 github.com 都连不上），只验到"入口会 302 到 github.com/login/oauth/authorize" |
| **浏览器手测** | ⏳ 需你完成 | 见第 3 节 |

命令一览（详细说明见下文）：

```powershell
cd D:\my_vibecoding\bookmark-manager

node scripts/verify-auth-guards.mjs     # 安全护栏（不需要库/服务）
node scripts/verify-auth-adapter.mjs    # adapter 契约（需可写库，先停 dev server）
node scripts/verify-auth-probe.mjs      # 邮箱+密码链路（同上）
npm run dev                             # 起服务后：
node scripts/verify-auth-session.mjs    # HTTP 端到端会话链路
node scripts/verify-day2-probe.mjs      # Day 2 回归（需先停 dev server）
```

---

## 1. 两个 Next.js 16 的硬约束（这次踩到并已修）

这两条都不是配置问题，而是 Next 16 的破坏性变更，写错了会直接编译失败：

1. **`middleware.ts` 已弃用，改名为 `proxy.ts`**，导出名也建议改为 `proxy`；
   且 `proxy` 的运行时固定为 `nodejs`，不能再配 `edge`。
   项目里对应 [proxy.ts](../proxy.ts)（Node 16 迁移文档：`node_modules/next/dist/docs/.../upgrading/version-16.md`）。
2. **`next.config.ts` 开了 `cacheComponents` 后，`dynamic` / `revalidate` / `fetchCache` 这些路由段配置被移除**。
   写 `export const dynamic = "force-dynamic"` 会让整条路由编译失败（页面 500）。
   正确做法是"静态外壳 + 把请求期数据下沉到 `<Suspense>`"：`/`、`/dashboard`、`/register`、`/signin`
   都是这个结构（见 Next 自带指南 `authentication-with-cache-components.md`）。

另外：本机 `next build` 用的 Turbopack 需要在 `.next` 下创建 junction（目录符号链接）。
若报 `failed to create junction point ... os error 5`，说明当前用户没有创建符号链接的权限——
在"设置 → 系统 → 开发者选项"里打开**开发者模式**，或用管理员终端构建即可。

## 2. GitHub OAuth 的收尾（需要你）

1. 打开 https://github.com/settings/developers → **New OAuth App**
2. 填写：
   - Application name：`bookmark-manager (local)`
   - Homepage URL：`http://localhost:3000`
   - **Authorization callback URL：`http://localhost:3000/api/auth/callback/github`**
3. 把 Client ID / Secret 填进 `.env`，然后**重启 dev server**（环境变量只在启动时读）：

```dotenv
AUTH_GITHUB_ID="Ov23li..."
AUTH_GITHUB_SECRET="..."
```

4. 验证 provider 已注册：

```powershell
curl.exe http://localhost:3000/api/auth/providers
# 预期同时出现 "github" 与 "credentials"
```

5. 浏览器里点「使用 GitHub 登录」，走完授权，应回到 `/dashboard`。

没配置凭据时应用不会报错：登录页会隐藏 GitHub 按钮并显示一条提示，邮箱+密码登录不受影响。

> 本会话只能验到"入口 302 到 github.com/login/oauth/authorize"这一步——沙箱出网被禁，
> 无法完成真实授权往返。

## 3. 浏览器手测清单

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `http://localhost:3000/` | 显示「登录」「注册」两个入口 |
| 2 | `/register` 填邮箱 + ≥8 位密码，提交 | 自动跳 `/dashboard`，登录方式=「邮箱密码」 |
| 3 | 点「退出登录」 | 回首页，首页恢复成「登录/注册」 |
| 4 | `/signin` 用刚才的账号登录 | 跳 `/dashboard` |
| 5 | 故意输错密码 | 显示「邮箱或密码不正确」（不区分用户不存在/密码错） |
| 6 | 未登录直接访问 `/dashboard` | 被跳到 `/signin?callbackUrl=%2Fdashboard`，登录后回到 `/dashboard` |
| 7 | 配好 GitHub 后点「使用 GitHub 登录」 | 授权后跳 `/dashboard`，登录方式=「GitHub OAuth」 |
| 8 | 已登录时访问 `/signin` 或 `/register` | 自动跳 `/dashboard` |
| 9 | 用**已注册的邮箱**去点 GitHub 登录 | 显示「该邮箱已用『邮箱密码』注册过…」而不是一串错误码 |
| 10 | 页面首屏 | 应先出现骨架占位、再流式替换成真实内容（cacheComponents 的流式渲染） |

**数据库侧核对**：邮箱注册 → `User` 新增 1 行（`passwordHash` 非空）、`Account` 无对应行；
GitHub 首登 → `User` + `Account` 各 1 行；**`Session` 表始终为空**（有 Credentials provider 时必须走 JWT 会话，设计如此）。

## 4. 探针说明

| 探针 | 覆盖 | 需要服务 | 需要可写库 |
| --- | --- | --- | --- |
| `verify-auth-guards.mjs` | open redirect 防护、会话字段白名单、错误码文案、DB 路径解析、proxy 结构、Next 16 迁移回归 | ✗ | ✗ |
| `verify-auth-adapter.mjs` | 官方 Prisma adapter 的 14 个方法在 Prisma 7 上是否真跑通 | ✗ | ✅ |
| `verify-auth-probe.mjs` | 注册入库、密码校验、失败分支、邮箱归一化 | ✗ | ✅ |
| `verify-auth-session.mjs` | CSRF → 凭据回调 → cookie → 会话解码 → 受保护路由 | ✅ | ✅ |

`verify-auth-session.mjs` 的注册动作走 Server Action（Next 内部协议），普通 HTTP 调不到，
所以它用 Prisma 直接建号；**注册本身的正确性由 `verify-auth-probe.mjs` 覆盖**。

探针共用 [scripts/lib/db-url.mjs](../scripts/lib/db-url.mjs) 解析连接串（统一转成绝对路径，
避免 libsql 按当前工作目录解析、连到空库）。

## 5. 清理一次性脚本

会话里为排查写了一些临时脚本（`.gitignore` 已排除 `scripts/tmp-*` 与 `/.tmp/`，不会入库，
但沙箱里删不掉，需要你手动清）：

```powershell
Remove-Item scripts\tmp-*.mjs, scripts\tmp-*.ps1 -Force
Remove-Item .tmp -Recurse -Force -ErrorAction SilentlyContinue
```

保留 `scripts/verify-*.mjs`、`scripts/lib/`、`scripts/migrate-remote.mjs`、`scripts/prisma-esm-hook.mjs`。

## 排错对照表

| 现象 | 原因 / 处理 |
| --- | --- |
| 构建报 `Route segment config "dynamic" is not compatible with nextConfig.cacheComponents` | 删掉该段配置，改为 `<Suspense>` 包住读会话的部分（见第 1 节） |
| 构建报 `uncached or runtime data during prerendering` | 同上：`auth()` / `searchParams` / Prisma 查询都在请求期，必须放进 `<Suspense>` |
| 构建报 `Both middleware file "./middleware.ts" and proxy file "./proxy.ts" are detected` | 只保留 `proxy.ts`，删掉 `middleware.ts` |
| 构建报 `failed to create junction point ... os error 5` | 打开 Windows 开发者模式，或用管理员终端构建 |
| 构建报 `缺少环境变量 DATABASE_URL` | 惰性 adapter 被破坏，检查 `auth.ts` 是否直接写了 `PrismaAdapter(getPrisma())` |
| 页面 500，终端报 `Can't resolve 'next-auth'` | 装完依赖后没重启 dev server |
| 登录后仍被踢回 `/signin` | `AUTH_SECRET` 为空或改动过；重启 dev server |
| 登录页显示 `OAuthAccountNotLinked` 原文 | 错误码文案映射失效，检查 `lib/auth-errors.ts` |
| 点 GitHub 登录报 `redirect_uri` 错误 | 回调地址必须精确等于 `http://localhost:3000/api/auth/callback/github` |
| 点 GitHub 登录跳 `/api/auth/error?error=Configuration` | 出网不通或 GitHub 凭据无效（本会话即是出网被禁） |
| 报 `UntrustedHost` | `.env` 里补 `AUTH_TRUST_HOST="true"`（Vercel 上不需要） |
| `SQLITE_READONLY` | `dev.db` 只读/属主异常，见 [ISSUES #1](./ISSUES.md) |
| `spawn EPERM`（`next dev` / `next build --webpack`） | 受限沙箱禁止 `fork`/管道子进程，见 [ISSUES #2](./ISSUES.md) |

排查时优先看 dev server 窗口输出；需要更详细的认证日志时临时加 `AUTH_DEBUG=true`。
