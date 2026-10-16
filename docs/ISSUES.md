# 问题库（Issues & 坑位记录）

记录这个项目在开发过程中**实际踩到**的问题：现象、根因、解法、以及"下次怎么快速判断"。

和 [DECISIONS.md](../DECISIONS.md) 的分工：DECISIONS 记"为什么这么选"，这里记"踩了什么坑、怎么绕"。
两者都会持续追加，新问题按时间顺序往下写，并同步在 [SESSION-RECORDS.md](./SESSION-RECORDS.md) 里留一次会话过程。

---

## #1 构建/启动全挂：`.next`、`dev.db` 被外部沙箱账号占着（2026-10-15）

**现象**

- 在受限环境（本次是 DSH 会话的 Windows 文件沙箱）里执行：
  - `npm run build` → `Error: EPERM: operation not permitted, open 'D:\...\.next\trace'`，随后
    `An IO error occurred while attempting to create and acquire the lockfile` / `拒绝访问。(os error 5)`；
  - `npm run dev` → `Error: spawn EPERM`；
  - Prisma 写入 → `SQLITE_READONLY: attempt to write a readonly database`；
  - 连自己新建的文件都删不掉：`Remove-Item` 报 `Access to the path is denied`。

**根因**

1. `.next`、`dev.db` 及其内部文件（`trace`、`trace-build`、`BUILD_ID` 等）的**显式 ACE 只属于几个外部沙箱账号**
   （`S-1-5-21-3988970182-...`、`S-1-5-21-1892272234-...`、`Rebirth\CodexSandboxUsers`），
   当前登录用户 `REBIRTH\Tadjiang`（`S-1-5-21-...-1001`）**没有任何显式条目**，只能继承到
   `Authenticated Users: (M)`。`(M)` 有 Write，但**没有** WRITE_DAC / WRITE_OWNER，所以改不了权限、也删不掉。
2. 这些对象的属主是外来账号，`takeown` 在**未提权**的窗口里还会额外缺 `SeTakeOwnershipPrivilege`，
   于是直接报 `The current logged on user does not have ownership privileges on the file`。
3. `npm run dev` / `next build` 的 `spawn EPERM` 是**另一类**问题（沙箱禁止带管道的子进程），
   和权限无关；见 #2。
4. 工作区根目录上还有一条 `Everyone: Deny DeleteSubdirectoriesAndFiles`，进一步让"删除"在各种路径上都失败。

**解法**

```powershell
# 在【管理员】PowerShell 里跑（提权后才有 SeTakeOwnershipPrivilege）
cd D:\my_vibecoding\bookmark-manager
takeown /F "dev.db"
icacls "dev.db" /grant "%USERNAME%:F"
takeown /F ".next" /R /D Y
icacls ".next" /grant "%USERNAME%:(OI)(CI)F" /T /C
```

- 也可在普通窗口里用 UAC 触发：
  `Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-Command', "..."`
- 改完用 `icacls dev.db` 确认出现 `REBIRTH\Tadjiang:(F)`，`Get-Item dev.db | Select Owner` 确认属主是自己。
- **不想碰 UAC 的替代路**：`dev.db` 里只有测试数据时，直接
  `Remove-Item dev.db`（走父目录的显式全权，不需要 WRITE_OWNER）然后 `npx prisma migrate dev` 重建。
  `.next` 没有"重建即属于你"的捷径，仍需 `takeown /R`。
- 删不掉文件还可能是根目录那条 deny：`icacls "D:\my_vibecoding\bookmark-manager" /remove:d "Everyone"`。
- **实测补充（更细的坑）**：`.next`、`dev.db` 这类对象的**属主是外来账号**，所以即使 `dev.db` 有
  `Authenticated Users: (M)`（含 Write、可读写数据），权限修改依旧会失败（`(M)` 不含 WRITE_DAC）。
  与之相对，沙箱**新建**的文件会带一条继承的 `S-1-4-*:(I)(W,D,DC)`（含删除权），所以新文件反而能改能删。
  本次还遇到第三种情况：仓库里由上一轮会话创建的 `DECISIONS.md`、`AGENTS.md` 既没有 `S-1-4-*` 条目、
  属主也不是自己，编辑时报 `ReplaceFileW EIO (Win32 1175)`，`icacls /grant` 也被沙箱拦下；
  最终是在获得一次性授权后执行 `icacls <文件> /grant <当前用户>:F` 才恢复可写。

**怎么快速判断**

- 报错里出现 `os error 5` / `拒绝访问` / `EPERM ... .next\trace` → 99% 是属主/权限，不是代码。
- `icacls <路径>` 里看不到自己的用户名条目、却有一堆 `S-1-5-21-*` 和 `CodexSandboxUsers` → 就是这个坑。
- `takeown` 说 "does not have ownership privileges" → 看窗口标题栏有没有「管理员: / Administrator:」，多半是没提权。

---

## #2 受限会话里 `npm run dev` / `next build` 必然 `spawn EPERM`（2026-10-15）

**现象**

```
Error: spawn EPERM
    at ChildProcess.spawn (node:internal/child_process:421:11)
    at D:\...\node_modules\next\dist\cli\next-dev.js:393:45
```

`prisma migrate status` 也会以同样原因失败：

```
Error: Schema engine exited. Error: Command failed with EPERM: ...schema-engine-windows.exe ... spawn EPERM
```

**根因**

Node 的 `child_process.fork/spawn` 默认用**管道**（pipe）捕获子进程输出。受限沙箱禁止打开命名管道，
所以只要一个工具"先起子进程再读它的输出"，就会 `EPERM`。`next dev` 会 fork 服务进程、Prisma CLI 会 spawn
`schema-engine`，都踩这条。

**受影响 / 不受影响**

| 命令 | 受限会话里 | 说明 |
| --- | --- | --- |
| `npm run lint` | ✅ 能跑 | ESLint 在进程内完成 |
| `npx prisma validate` | ✅ 能跑 | 纯解析 schema，不起引擎 |
| `npx prisma migrate status` / `studio` | ❌ spawn EPERM | 要起 schema-engine |
| `npm run dev` / `npm run build` | ❌ spawn EPERM（权限正常时） | fork 服务进程 |
| `node 脚本.mjs`（直接写文件读数据库） | ✅ 能跑 | 无子进程，stdio 直接继承 |

**解法**

- 需要构建/起服务/Studio 时，**在受管沙箱之外**（你自己的普通终端）执行。
- 会话里的替代验证手段：`node scripts/verify-day2-probe.mjs`、`curl.exe http://localhost:3000/api/health`、
  `npx prisma validate`、`npm run lint`——这套已经足够覆盖 Day 1/2 的全部结论（见 SESSION-RECORDS）。
- 不要反复重试同一个 `spawn EPERM` 命令：这是设计边界，重试不会变好。

---

## #3 `npx prisma studio` 打不开 `file:./dev.db`（Prisma 7.10.0，2026-10-15）

**现象**

```
Loaded Prisma config from prisma7.config.ts.
! Prisma Studio is not supported for the "file:./dev.db" protocol.
```

**根因**

`node_modules/prisma/build/cli.js` 里 studio 命令这样判断协议：

```js
let c = a.split("://")[0].toLowerCase();   // 用 "://" 切协议名
...
let u = cur[c];                            // cur = { file, postgres, postgresql, mysql, sqlserver }
if (!u) return new rd(`Prisma Studio is not supported for the "${c}" protocol.`);
```

`file:./dev.db` **不含 `://`**，切出来是整个字符串 `file:./dev.db`，`cur["file:./dev.db"]` 取不到，
于是把整条连接串当成协议名打印出来。

讽刺的是 `cur` 里**有** `file` 条目，也写了完整的本地 SQLite 实现
（`createExecutor` 内动态 `import("node:sqlite")`，需要 Node ≥ 22.13），但 `file:` 这种常见写法永远走不到那里。
`postgresql://`、`mysql://`、`sqlserver://` 都带 `://`，所以不受影响。属版本缺口，与项目配置无关。

**解法（绕过）**

```powershell
npx prisma studio --url "file:///D:/my_vibecoding/bookmark-manager/dev.db"
```

带 `://` 后协议名能正确切成 `file`，就能走到那个 sqlite executor。**注意**：该代码路径在文件不存在时会
"新建一个空库"并打印 `Database file ... was not found. A new file was created.`，所以打开后要确认
表和数据都在（`User / Bookmark / Tag`，行数与 `/api/health` 一致），并检查盘上没多出空的 `dev.db`。

**替代方案**

- 只读看数据：用 `@libsql/client` 直接查（见 [README](../README.md) 的「自己验证数据库链路」一节）。
- 完整验证：`node scripts/verify-day2-probe.mjs`。

---

## #4 纯 Node 里 import 生成的 Prisma 客户端会 `ERR_MODULE_NOT_FOUND`（2026-10-15）

**现象**

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'D:\...\app\generated\prisma\enums'
imported from D:\...\app\generated\prisma\client.ts
```

**根因**

`prisma-client` 生成器产出的是**打包器风格的无扩展名相对导入**（`./enums`、`./internal/class`，
见 `app/generated/prisma/client.ts`），这是给 Next.js / Turbopack 的解析规则用的。
Node 的 ESM 解析器要求显式扩展名，所以直接 `import` 会失败
（`--experimental-strip-types` 只负责擦类型，不管解析）。

**解法**

在 import 生成客户端之前注册一个补扩展名的 loader（已随仓库提供）：

```js
import { register } from "node:module";
register("./prisma-esm-hook.mjs", import.meta.url);   // 见 scripts/prisma-esm-hook.mjs
const { PrismaClient } = await import("../app/generated/prisma/client.ts");
```

需要 Node ≥ 22.6（带类型擦除；实测 Node 24.11 直接可用）。注意这只适用于**仓库自带的脚本**，
Next.js 应用本身不需要——Turbopack 会正确解析。

**坑中坑**：项目 `package.json` 没有 `"type": "module"`，import `.ts` 时 Node 会警告
`MODULE_TYPELESS_PACKAGE_JSON ... Reparsing as ES module`。只是噪音，不影响运行；不要为了消警告去改
`package.json`，那会影响 Next.js 的模块判定。

---

## #5 PowerShell 下 `node -e "..."` 的内层引号会被吃掉（2026-10-15）

**现象**

```powershell
node -e "const {createClient}=require('@libsql/client'); ..."     # 引号丢失，语法错误
```

甚至用单引号包外层也会被 `pwsh` 剥掉双引号，报 `Invalid or unexpected token`。

**根因**

PowerShell 向原生程序传参时会重新解析引号，`-e` 里的 JS 字符串层层嵌套后必然出问题。

**解法**

- 直接用**脚本文件**（推荐，仓库里的 `scripts/*.mjs` 就是这么来的）；
- 或用停止解析符 `--%`：`node --% --input-type=module -e "..."`；
- 或在 JS 里用 `String.fromCharCode` / 避免嵌套引号，但可读性很差，不推荐。

---

## #6 某些 md 文件改不动：`ReplaceFileW EIO (Win32 1175)`（2026-10-15）

**现象**

用编辑工具改 `DECISIONS.md` 时报：

```
Error: ReplaceFileW EIO (Win32 1175): D:\my_vibecoding\bookmark-manager\DECISIONS.md
```

同一批操作里 `README.md`、`TASKS.md` 却能正常保存；`Add-Content` 写入报 `Access to the path ... is denied`。

**根因**

属于 #1 的第三种情况：这些文件由上一轮会话创建，**属主是外来账号**，ACL 里既没有当前用户的显式条目，
也没有沙箱新文件会继承到的 `S-1-4-*:(I)(W,D,DC)` 条目。于是：

- 编辑工具"写临时文件再替换"的做法在替换环节被拒绝（1175 = ERROR_UNABLE_TO_MOVE_REPLACEMENT）；
- 只对 DACL 授权（`icacls /grant`）又会被沙箱自己的文件策略先拦下来。

**解法**

对具体文件补一条当前用户的完全控制：

```powershell
icacls "DECISIONS.md" /grant "$env:USERNAME:F"
```

如果沙箱以 `file access denied` 拦下这条命令，需要一次性放宽权限后再执行（本次就是这么解决的）。
之后 `Add-Content` 等写入就正常了。

**怎么快速判断**

- 比较文件 ACL：能保存的文件里有 `S-1-4-*:(I)(W,D,DC)`，报 1175 的没有。
- 报 1175 而不是 `Access denied`，通常意味着"能写内容、不能替换/删除"这一类权限缺失。

---

## #7 Next 16：`cacheComponents` 与路由段配置互斥（2026-10-15）

**现象**

页面在浏览器里 500，dev server 日志里是编译错误：

```
Error: Route segment config "dynamic" is not compatible with `nextConfig.cacheComponents`. Please remove it.
./app/dashboard/page.tsx:15:14
> 15 | export const dynamic = "force-dynamic";
```

`next build` 阶段还会以另一种形式报出来：

```
Error: Route "/" : Next.js encountered uncached or runtime data during prerendering.
`fetch(...)`, `cookies()`, `headers()`, `params`, `searchParams`, or `connection()` accessed outside of <Suspense>
```

**根因**

`next.config.ts` 里开了 `cacheComponents: true`。Next 16 在这个模式下**移除了** `dynamic` / `revalidate` /
`fetchCache` / `dynamicParams` 这些路由段配置（它们原来用来给整条路由选渲染模式）。同时，任何请求期数据
（`cookies()`、`headers()`、`searchParams`、以及读会话的 `auth()`）**不能出现在 `<Suspense>` 之外**，
否则无法生成静态外壳，构建直接失败。

**解法**

1. 删掉 `export const dynamic = "force-dynamic"` 之类的段配置。
2. 把读请求期数据的部分下沉到 `<Suspense>` 后面：外层保持**同步**（只创建 Promise、不 await），
   内层 async 组件里再 await。

```tsx
// app/dashboard/page.tsx —— 外层同步 → 可预渲染成静态外壳
export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  const session = await auth();   // 读取发生在 Suspense 内，构建期不会执行
  ...
}
```

`searchParams` 同理：把 `Promise<SearchParams>` 当 props 传给 Suspense 内的组件，而不是在页面顶层 await。

3. 实在来不及改造的路由，可以临时用 `export const instant = false` 让该路由继续阻塞渲染
   （官方给的迁移过渡手段，见 `authentication-with-cache-components.md`），但推荐按第 2 步做。

**怎么快速判断**

- 报错里出现 `not compatible with nextConfig.cacheComponents` → 删段配置。
- 报错里出现 `uncached or runtime data during prerendering` → 找哪个 `await` 读的是请求期数据，包进 `<Suspense>`。
- 本地文档：`node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`、
  `.../migrating-to-cache-components.md`。

---

## #8 Next 16：`middleware.ts` 弃用，改名 `proxy.ts`（2026-10-15）

**现象**

`next build` / `next dev` 打印：

```
⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
```

两个文件同时存在时更直接：

```
Error: Both middleware file "./middleware.ts" and proxy file "./proxy.ts" are detected. Please use "./proxy.ts" only.
```

**根因**

Next 16 把 `middleware` 改名为 `proxy`，以强调它是网络边界上的请求代理。同时：

- 导出名建议从 `middleware` 改为 `proxy`（默认导出也行）；
- **`proxy` 的运行时固定为 `nodejs`，不能再配置 `edge`**（想继续用 edge 就暂时保留 `middleware`）；
- 相关配置项也改名，例如 `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`。

**解法**

```bash
mv middleware.ts proxy.ts
```

然后保留原逻辑与 `config.matcher`，导出函数名改成 `proxy`（本项目用 `export default auth(...)`）。
本项目里对应 [proxy.ts](../proxy.ts)。

**怎么快速判断**

- 报 `Both middleware file ... and proxy file ... are detected` → 删掉 `middleware.ts`。
- 别名作用一致，行为不会因为改名改变；记得 `config.matcher` 要跟着文件一起保留。

---

## #9 Windows 上 Turbopack 建不了 junction（2026-10-15）

**现象**

`npm run build` 在收集/编译阶段崩掉：

```
FATAL: An unexpected Turbopack error occurred.
Error [TurbopackInternalError]: failed to create junction point at "...\.next\node_modules\@libsql\client-..."
Caused by: creation of a new symbolic link or junction point failed: 拒绝访问。(os error 5)
```

**根因**

Turbopack 会在 `.next/node_modules` 下为某些包创建 junction（目录符号链接）。Windows 默认**只有管理员
或开启了"开发者模式"的用户**才有创建符号链接的权限，普通用户直接 `os error 5`。这和项目代码无关。

**解法**

任选其一：

1. **打开开发者模式**（推荐）：设置 → 系统 → 开发者选项 → 开发者模式。
2. 用**管理员终端**运行 `npm run build`。
3. 改用 webpack 构建：`npm run build -- --webpack`（不需要 junction；本机实测能过编译阶段，
   但受限沙箱里会另外卡在 `spawn EPERM`，见 #2）。

**怎么快速判断**

- 报错里出现 `failed to create junction point` / `os error 5` 且路径在 `.next\node_modules\` 下 → 就是这个。
- 与 #1 的区别：#1 是文件/目录权限被外来账号占着（连 `.next` 本身都写不进），#9 是能写但没有建符号链接的特权。

---

## #10 受限沙箱的能力边界（2026-10-15）

**现象**

同一个环境里，有些命令莫名其妙失败，但换台机器就正常：

```
fork default (pipe+ipc): THROW EPERM spawn EPERM      ← child_process.fork 一律被拒
fork stdio inherit:      THROW EPERM spawn EPERM
spawn stdout inherit:    EXIT 1（能起，但子进程自身报错）
spawn stdout pipe:       THROW EPERM spawn EPERM
listen EACCES: permission denied 127.0.0.1:3000        ← 禁止监听端口
OUTBOUND_FAIL: 连 github.com 都连不上                    ← 出网被禁
```

**根因**

DSH 这类受限沙箱会按能力逐项收窄：禁止命名管道（因此 `fork` 与一切带 pipe 的 `spawn` 全失败）、
禁止监听端口、禁止出网。`fork()` 无论 stdio 怎么配都不可用，因为它必须建立 IPC 通道。

**影响与对策**

| 场景 | 受限沙箱内 | 对策 |
| --- | --- | --- |
| `next dev` / `next build` | ❌ CLI 里 `fork(start-server)` | 在沙箱外跑；或直接调用内部 `startServer`（见下） |
| `next build --webpack` | ❌ Next 会 spawn 类型检查/lint worker | 沙箱外跑 |
| `npx prisma migrate status` / `studio` | ❌ 要 spawn schema-engine | 沙箱外跑；`prisma validate` 不受影响 |
| 需要监听端口的验证 | ❌ `EACCES` | 申请一次更高权限，或沙箱外跑 |
| Mock 外部 OAuth（github.com） | ❌ 出网被禁 | 只能验到"入口 302 到 github.com"，真实授权须在沙箱外做 |
| `node 脚本.mjs`（纯计算 + 文件读写） | ✅ | 探针脚本都按这个方式写 |

**绕过 `fork` 起服务的写法**（会话内验证时用过）：不走 CLI，直接调用 Next 内部启动器，
这样进程模型里没有 `fork`：

```js
import { startServer } from "../node_modules/next/dist/server/lib/start-server.js";

await startServer({ dir: process.cwd(), port: 3100, isDev: true, hostname: "127.0.0.1" });
```

配合 `spawn(..., { stdio: "inherit" })` 启动即可；但**仍需**解除端口监听限制，否则报 `EACCES`。

---

## #11 工作区"部分目录/文件写不进去"：缺了低完整性级别标记（2026-10-16）

**现象**

同一个会话里，写入能力看起来毫无规律：

| 能写 | 写不了 |
| --- | --- |
| 仓库根目录、`docs/`、`.next/`、`types/`、`README.md` | `app/` 的部分文件、`lib/`、`scripts/`、`prisma/`、`public/`、`.git/`、`dev.db` |

报错还各不相同，很容易被分别误判成三个不相关的问题：

- PowerShell `Set-Content` → `Access to the path '...' is denied.`
- `git add` → `fatal: Unable to create '.../.git/index.lock': Permission denied`
- Prisma / 探针 → `SQLITE_READONLY: attempt to write a readonly database`

而 `icacls` / `Get-Acl` 看 DACL 明明有 `NT AUTHORITY\Authenticated Users:(M)`，
有些对象甚至有 `Rebirth\Tadjiang:(F)`——按"权限"算完全应该能写。

**根因**

两件事叠在一起，而且**都不体现在 DACL 里**：

1. **令牌是低完整性级别（Low Integrity）**。`whoami /all` 显示
   `Mandatory Label\Low Mandatory Level  S-1-16-4096`。Windows 的强制完整性控制（MIC）
   会挡住低完整性进程对"未标记对象"（按中完整性处理）的写入。关键点是：**MIC 在 DACL 检查之后才判**，
   而且它不作为访问项出现在 `icacls` 列表里，所以只看 DACL 一定会得出"权限没问题"的错误结论。
2. **缺标记的对象恰好就是那批写不了的**。工作区根目录上有
   `Mandatory Label\Low Mandatory Level:(OI)(CI)(NW)`（本意就是递归下传给整个工作区），
   `docs`/`.next`/`types` 继承到了，而 `app`/`lib`/`scripts`/`prisma`/`public`/`.git`/`dev.db`
   没继承到（它们的 SACL 是冻结的，父目录后来加的标记没有传下去）。

**怎么快速判断**

```powershell
whoami /all | Select-String 'Mandatory Label'      # 进程是不是 Low？
foreach ($p in @('.','app','lib','scripts','.git','dev.db')) {
  $o = icacls $p 2>&1 | Select-String 'Mandatory Label'
  "{0,-10} {1}" -f $p, (($o -join ';').Trim())     # 对象有没有 Low 标记？
}
```

两边一对比：**进程是 Low、对象却无标记 → 就是这个坑**。

> ⚠️ 不要被 `Everyone:(DENY)(DC)`、`S-1-4-*:(W,D,DC)`、`CodexSandboxUsers` 这些条目带偏——
> 那些是沙箱/历史会话自己加的，属正常，**不要删**。

**解法**

给缺标记的对象补上和工作区根目录一致的标记。这一步要写对象的完整性标记，受限令牌自己做不了，
需要一次更高权限的执行（提权窗口，或一次性授权）：

```powershell
icacls <目录> /setintegritylevel "(OI)(CI)Low" /T /C   # 目录：带继承，下传给子项
icacls <文件> /setintegritylevel Low                    # 单个文件（如 dev.db）
```

还原：对同一对象执行 `icacls <对象> /setintegritylevel Medium`。

2026-10-16 那次实际补过标记的对象：`app`、`public`、`.git`（及其内部文件）、`dev.db`、
`.env`、`.env.example`、`.gitignore`。**未改动**任何文件内容、属主或访问权限项。

**还有一个"看起来像权限、其实是属主"的分支**

`lib`、`scripts`、`prisma` 三个目录的**属主是外来账号 `Rebirth\CodexSandboxOffline`**，
当前用户既没有改它们权限、也没有改它们标记的权利，连上面那条 `icacls` 都会被拒
（`Access is denied.`）。这种情况只能走 #1 的管理员 `takeown` 路径，或者把会话切到「完全权限」。

> 别把两件事混起来：**「完全权限」解决的是"进程不再是低完整性"**，
> 于是 DACL 里本来就有写权限的对象（`Authenticated Users:(M)`）就能写了；
> 它**并不等于**拿回了对象的属主权限——改 ACL 依然会被拒。

**顺带一条同样容易被误判的**

写入失败时要先看**父目录**。`.git/index.lock` 写不了，卡住的是 `.git/` 这个目录本身；
`dev.db` 报 `SQLITE_READONLY` 时，SQLite 还需要在同目录建 `-journal`/`-wal`，
所以目录能不能写同样关键。


