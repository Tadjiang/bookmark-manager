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
