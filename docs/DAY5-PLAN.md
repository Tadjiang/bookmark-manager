# Day 5 规划与开工指引：UI 优化 + 部署

> 2026-10-16 起草。**下一轮开工前先读本文档**，它记录了当前进度、阻塞点和恢复步骤。
> 上游依据：[TASKS.md](../TASKS.md) 的 Day 5 清单；阻塞详情见 [ISSUES #12](./ISSUES.md)；
> 访问方式的决策见 [DECISIONS.md 第 11 节](../DECISIONS.md)。

---

## 0. 当前进度快照（2026-10-16 收尾时）

| 项 | 状态 |
| --- | --- |
| Day 1–3（初始化 / 数据库 / 认证） | ✅ 已完成并提交 |
| Day 4（书签 CRUD） | ✅ 已完成，`a054920`；自动化探针 + 本地浏览器手测 12 条全过 |
| 远端数据库（Turso） | ✅ 已建库、迁移已应用、`db:verify:remote` 返回 `RESULT_OK` |
| 远端运维工具链 | ✅ `db:migrate:remote` / `db:verify:remote` / `db:verify:local` |
| Vercel 部署 | ✅ 已上线，`Status: Ready` / `Environment: Production` |
| **国内访问线上站点** | ❌ **被阻塞**：`*.vercel.app` 遭 DNS 污染 + SNI 阻断 |
| 线上功能验证（注册 / CRUD） | ⏸ **未做**——因为打不开，等自定义域名 |
| Day 5（UI 优化 + 部署） | ⏸ 未开始 |

### 已知的具体值（下一轮直接用，不用再问）

| 项 | 值 |
| --- | --- |
| Vercel 项目 | `bookmark-manager`，团队 `tao-9330` |
| 当前生产域名 | `bookmark-manager-git-main-tao-9330.vercel.app`（**国内不可访问**） |
| 本次部署专属域名 | `bookmark-manager-8wm4witrj-tao-9330.vercel.app` |
| Turso 地址 | `libsql://bookmark-manager-tadjiang.aws-ap-northeast-1.turso.io` |
| Git remote | `git@github.com:Tadjiang/bookmark-manager.git` |
| 本地数据库 | `dev.db`（`DATABASE_URL="file:./dev.db"`，**没有被 Turso 覆盖**） |

> 远端库目前是**空库**（`users=0 bookmarks=0 tags=0`），线上首次使用需要**重新注册账号**。

---

## 1. 阻塞项：自定义域名（优先级最高）

**为什么必须做**：见 [ISSUES #12](./ISSUES.md)。简单说，`*.vercel.app` 在国内被
DNS 投毒 + SNI 阻断，而 Vercel 的 anycast IP 本身是通的（`turso.tech` 实测 200）。
换个域名就能解决，且**不需要 ICP 备案**（Vercel 在境外）。

### 域名到位后的操作清单

按顺序做，每步都有验证点：

1. **Vercel 绑定域名**
   项目 → Settings → Domains → Add，填域名（建议先用子域，如 `bookmarks.example.com`）。
   Vercel 会显示需要添加的 DNS 记录。

2. **域名商处加 DNS 记录**
   - 子域：加 `CNAME`，主机记录填子域名前缀，值 `cname.vercel-dns.com`
   - 主域（apex）：按 Vercel 提示加 `A` 记录（`76.76.21.21`）或它给的 ALIAS/ANAME
   - **验证点**：Vercel 的 Domains 页面应显示 `Valid Configuration`（首次可能要几分钟到几小时）

3. **从新域名验证连通性**（关键一步，别跳过）
   ```powershell
   curl.exe -i https://bookmarks.example.com/api/health
   ```
   - 预期 `HTTP/2 200` + `{"ok":true}` → **线上链路通了**
   - `{"ok":false}` + 503 → Vercel 环境变量没配或没生效，见第 3 节
   - 仍连不上 → 见 [ISSUES #12](./ISSUES.md) 的判断表

4. **改 GitHub OAuth 回调地址**（用 GitHub 登录才需要）
   https://github.com/settings/developers → OAuth App → Authorization callback URL
   追加一行 `https://bookmarks.example.com/api/auth/callback/github`（localhost 那条保留）。

5. **把线上手测补上**（Day 4 清单，在新域名上重跑一遍）
   见 [DAY4-VERIFICATION.md](./DAY4-VERIFICATION.md) 第 4 节，重点是写操作：
   注册 → 新增 → 搜索 → 编辑 → 删除，另外确认"换账号看不到别人的书签"。

6. **回填文档**：把新域名写进本文档、README、`DECISIONS.md` 第 11 节。

---

## 2. Day 5 的正式目标（不依赖域名，可以并行开工）

| # | 目标 | 验收标准 |
| --- | --- | --- |
| 1 | **完善样式** | 视觉统一；列表卡片、表单、按钮的间距与层级明确 |
| 2 | **响应式设计** | 375px 单列不横向滚动；768px / 1280px 布局合理；**长 URL、长标题、长标签不撑破容器** |
| 3 | **错误处理** | 数据库异常、会话过期、删除失败都有可读反馈，不出现白屏 |
| 4 | **加载状态** | 骨架屏与真实布局同构；提交时按钮进入 pending；搜索时有查询中提示 |
| 5 | **部署** | 域名绑定完成，线上可访问 |

**非目标**：暗黑模式开关、分页、导入导出、限流（都排在后面）。

### 建议的开工顺序

1. **先做样式 + 响应式**（纯本地，`npm run dev` 即可迭代，见效最快）；
2. 顺手补**错误边界与加载态**（`app/dashboard/error.tsx`、`loading` 相关）；
3. 域名一到位立刻插队做第 1 节的验证清单，**不要**等 UI 全做完再验证——部署问题越早暴露越好。

---

## 3. ⚠️ 还没验证过、下一轮必须先确认的事

这一条很重要，别被"部署 Ready"误导：

### 3.1 Vercel 的环境变量到底配了没有？

本次会话**没有确认过**这一步是否完成。已知的线索只有"部署本身成功了"——
但那证明不了环境变量存在，因为本项目**刻意做成了构建期不需要数据库凭据**
（[DECISIONS.md 第 4 节](../DECISIONS.md) 的惰性初始化），缺变量只会在请求期退化成 503。

需要配齐（Production / Preview / Development 三个环境都要勾）：

| Name | 值的来源 |
| --- | --- |
| `DATABASE_URL` | Turso 地址（= **本地 `.env` 里的 `REMOTE_DATABASE_URL`**，别填错成本地的 `file:`） |
| `DATABASE_AUTH_TOKEN` | 本地 `.env` 的 `REMOTE_DATABASE_AUTH_TOKEN` |
| `AUTH_SECRET` | 本地 `.env` 的 `AUTH_SECRET` |

> 取值命令（在**你的**终端跑，注意别把 token 贴进聊天）：
> ```powershell
> $cfg = @{}
> Get-Content .env | Where-Object { $_ -match '=' -and $_ -notmatch '^\s*#' } |
>   ForEach-Object { $k, $v = $_ -split '=', 2; $cfg[$k.Trim()] = $v.Trim().Trim('"') }
> "DATABASE_URL=$($cfg['REMOTE_DATABASE_URL'])"
> "DATABASE_AUTH_TOKEN=$($cfg['REMOTE_DATABASE_AUTH_TOKEN'])"
> "AUTH_SECRET=$($cfg['AUTH_SECRET'])"
> ```
>
> 配完必须**手动 Redeploy**（Deployments → ⋯ → Redeploy）；环境变量在部署时注入，改完不会自动生效。

**判断方式**：域名能访问后打 `/api/health`，返回 `{"ok":true}` 就说明配好了。
线上刻意不返回统计数字（[app/api/health/route.ts](../app/api/health/route.ts)），所以只看 `ok` 字段。

### 3.2 其它未确认项

- 线上注册/登录是否正常（`AUTH_SECRET` 缺失时 Auth.js 会报错）；
- Turso 免费额度与地域延迟（`aws-ap-northeast-1` 是东京，国内访问延迟可接受）；
- GitHub OAuth 在线上是否可用（回调地址未改之前**一定失败**）。

---

## 4. 环境注意（受限会话，别重复踩）

- **出网被禁**：会话内跑不了 `db:verify:remote`（连不上 Turso）、也无法访问部署域名。
  这类验证**必须在你的终端**做，或把结果贴回来。
- **`npm run build` 在会话内会失败**：Turbopack 建不了 `.next/node_modules` 符号链接
  （[ISSUES #9](./ISSUES.md)）。会话外普通终端可正常构建（已验证 exit 0）。
- **`lib` / `scripts` / `prisma` 的属主仍是外来账号** `Rebirth\CodexSandboxOffline`
  （[ISSUES #11](./ISSUES.md)）。受限会话靠「完全权限」才能写这三个目录。
  建议在管理员终端跑一次 `takeown` + `icacls` 根治。
- 改代码前先看 [AGENTS.md](../AGENTS.md) 的「Next.js 16 的两条硬约束」和「环境注意」。

---

## 5. 遗留待办汇总

- [ ] **绑自定义域名**（阻塞线上验证，最高优先级）
- [ ] **确认 Vercel 环境变量**（3.1 节，未验证）
- [ ] 域名就绪后：改 GitHub OAuth 回调 + 线上重跑 Day 4 手测 12 条
- [ ] Day 5 本体：样式、响应式、错误处理、加载状态
- [ ] `lib` / `scripts` / `prisma` 属主改回自己（可选，但能免掉以后每次的权限折腾）
- [ ] 公网开放前补限流（注册与新增书签目前都没有速率限制）

---

## 6. 下一轮开场可以这样说

> 读 `docs/DAY5-PLAN.md`，接着推进。

如果域名已经买好并想先解决访问问题，就直接说：

> 域名买好了，是 `xxx.com`，先带我绑定。
