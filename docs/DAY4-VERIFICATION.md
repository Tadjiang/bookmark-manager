# Day 4 验证：书签 CRUD

> 2026-10-16。规划见 [DAY4-PLAN.md](./DAY4-PLAN.md)，实际实现按规划里的**方案 A**
> （Server Actions + Server Component 查询），取舍记录见 [DECISIONS.md](../DECISIONS.md) 第 10 节。

## 1. 本次拍板的三个问题

| # | 问题 | 决定 |
| --- | --- | --- |
| 1 | 接口形态 | **A：Server Actions 写 + Server Component 读**（不实现 5 个 REST 路由） |
| 2 | 搜索范围 | **标题 + URL**（MVP，`description` 与标签名不参与关键词搜索） |
| 3 | 标签输入 | **逗号分隔文本框**，服务端归一化 + `connectOrCreate` 语义（`upsert`） |

## 2. 验证结果（全部实跑）

| 验证项 | 手段 | 结果 |
| --- | --- | --- |
| Lint | `npm run lint` | ✅ exit 0 |
| 类型 | `npx tsc --noEmit` | ✅ exit 0 |
| 输入校验 / 标签归一化（48 项断言） | `node scripts/verify-bookmark-input.mjs` | ✅ `RESULT_OK` |
| 数据库链路（23 项断言） | `node scripts/verify-bookmarks-probe.mjs` | ✅ `RESULT_OK` |
| Day 2 回归 | `node scripts/verify-day2-probe.mjs` | ✅ `RESULT_OK` |
| Day 3 回归（护栏） | `node scripts/verify-auth-guards.mjs` | ✅ `RESULT_OK` |
| Day 3 回归（adapter 契约） | `node scripts/verify-auth-adapter.mjs` | ✅ `RESULT_OK` |
| 生产构建 | `npm run build` | ❌ 见下 |

### 构建为什么失败（不是代码问题）

```
failed to create junction point at ".next\node_modules\@libsql\client-..."
Caused by: creation of a new symbolic link or junction point failed: 拒绝访问。(os error 5)
```

就是 [ISSUES #9](./ISSUES.md) 记的那条：Turbopack 需要在 `.next/node_modules` 下建符号链接，
Windows 默认只允许管理员或开了「开发者模式」的账号创建。修法二选一：

1. 设置 → 系统 → 开发者选项 → 打开**开发者模式**（改完重开终端）；
2. 或在**管理员**终端里跑 `npm run build`。

**注意**：本次构建已经越过了 Day 3 记录过的 `spawn EPERM`（CLI 真的跑起来了，走到了 Turbopack 阶段），
说明当前会话的子进程限制比之前宽松；卡住的是 Windows 的符号链接权限，与沙箱无关。

## 3. 探针覆盖了什么、没覆盖什么

### 覆盖（`verify-bookmarks-probe.mjs`）

| # | 断言点 | 说明 |
| --- | --- | --- |
| 1 | **越权** | 用户 B 对 A 的书签做 `findFirst` / `deleteMany` / `updateMany`（都带 `userId`）全部落空，A 的数据三次尝试后完好 |
| 2 | **标签幂等** | 同一标签 `upsert` 三次仍只有一行；`(userId, name)` 唯一约束下，同名标签在两个用户名下各一行 |
| 3 | **搜索** | 标题片段、URL 片段、ASCII 大小写混写都能命中；不匹配返回 0；**不会跨用户命中** |
| 4 | **标签筛选** | 单独筛选命中数正确；与关键词叠加是 AND（关键词不命中时结果 0） |
| 5 | **关联清理** | 删除书签后 `_BookmarkToTag` 关联行归零；标签行本身保留 |
| 6 | **数据自清理** | `BASELINE == FINAL`（users=1 bookmarks=1 tags=2 → 同一组数字） |

### 没覆盖（**别误读**）

- **数据访问层本身没有被 import**。`lib/bookmarks.ts` 依赖 `@/auth` 与 `next/navigation`，
  纯 Node 下加载不了，所以探针走的是「Prisma 客户端 + 与 DAL 相同的查询形状」。
  「DAL 是否真的处处带了 `userId`」这条由 `verify-bookmark-input.mjs` 第 5 节的**静态护栏**来守：
  - DAL 不许导出任何接收 `userId` 参数的函数（否则越权防护退化成"调用方自觉"）；
  - `getBookmark` 必须是 `findFirst({ where: { id, userId } })`；
  - `deleteBookmark` 必须是 `deleteMany({ where: { id, userId } })`；
  - `updateBookmark` 必须先经 `findOwnedId`；
  - Server Actions 必须调 `refresh()`、必须用 `isRedirectError` 放行跳转；
  - dashboard 页面不许出现 `dynamic` 段配置（[ISSUES #7](./ISSUES.md)）。
- **UI 完全不覆盖**。表单交互、防抖、行内编辑、二次确认都只能在浏览器里手点，清单见第 4 节。
- **限流不存在**。新增书签没有速率限制，公网开放前要补（见 [DECISIONS.md](../DECISIONS.md) 第 10 节的遗留）。

## 4. 浏览器手测清单（人工，需要在会话外跑 `npm run dev`）

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 登录后打开 `/dashboard`，新增一条书签 | 立刻出现在列表顶部，无需手动刷新 |
| 2 | 提交空标题 / `javascript:alert(1)` | 表单原位显示红色字段错误，不跳转、不清空已填内容 |
| 3 | 标签填 `Work, work , WORK` | 保存后只显示一个 `work` 标签 |
| 4 | 点某条的「编辑」，改标题后保存 | 列表对应条目更新，编辑框自动收起 |
| 5 | 编辑框点「取消」 | 收起且不改数据 |
| 6 | 搜索框输入标题片段，停顿 | 300ms 后只显示匹配项，URL 里出现 `?q=`，页面不跳动到顶部 |
| 7 | 点某个标签 | 与关键词叠加生效（AND）；再点一次该标签取消筛选 |
| 8 | 筛选后无结果 | 显示「没有匹配的书签」+ 清除筛选入口（与"一条都没有"的文案不同） |
| 9 | 删除并点「确定」 | 条目消失；刷新页面后仍不存在 |
| 10 | 删除时点「取消」 | 什么都不发生 |
| 11 | 换一个账号登录 | 看不到上一个账号的书签、标签，搜索也不串号 |
| 12 | 窄屏（375px） | 单列布局，不出现横向滚动 |

## 5. 排错对照表

| 现象 | 多半是什么 | 怎么办 |
| --- | --- | --- |
| 新增后列表不刷新 | 忘了 `refresh()`，或它在 try/catch 里被跳过 | 确认 `app/actions/bookmarks.ts` 里 `refresh()` 在 try 之后 |
| 提交后停在原地、无任何提示 | Server Action 抛了未捕获异常 | 看 dev server 终端；DAL 抛错会被转成"保存失败" |
| 未登录却显示"保存失败" | `redirect()` 的 NEXT_REDIRECT 被 catch 吞了 | 确认 catch 里有 `isRedirectError` 分支并 rethrow |
| 能看到别人的书签 | DAL 某处只按 id 查 | 跑 `node scripts/verify-bookmark-input.mjs`，第 5 节会报出来 |
| 出现 `Work` 和 `work` 两个标签 | 归一化没走到（或有人绕过 DAL 直接写库） | 标签名一律经 `parseTags` 转小写后入库 |
| 页面 500 且报 segment config | 有人补回了 `export const dynamic` | 删掉；改用「外壳 + Suspense」（[ISSUES #7](./ISSUES.md)） |
| `SQLITE_READONLY` | Windows 属主/完整性标记问题 | 见 [ISSUES #1](./ISSUES.md) 与 [#10](./ISSUES.md) |
