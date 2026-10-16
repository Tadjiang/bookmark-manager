# Day 4 规划：书签 CRUD

> 2026-10-15 起草。本文档是**规划**，保留当时的取舍过程。
> 目标来自 [TASKS.md](../TASKS.md) 的 Day 4 清单；约束来自 [DECISIONS.md](../DECISIONS.md) 第 8、9 节
> 与 [docs/ISSUES.md](./ISSUES.md) 的 #7。
>
> **状态（2026-10-16）**：已按第 8 节的三个决定落地——接口形态取**方案 A**（Server Actions + 查询）、
> 搜索范围为**标题 + URL**、标签用**逗号分隔文本框**。实际实现与验证结果见
> [DAY4-VERIFICATION.md](./DAY4-VERIFICATION.md)，决策记录见 [DECISIONS.md](../DECISIONS.md) 第 10 节。
> 下文中"需要你拍板"的部分是历史记录，不必再回答。

## 0. 目标与验收标准

| # | 功能 | 验收标准 |
| --- | --- | --- |
| 1 | 创建书签 | URL + 标题必填，描述与标签可选；保存后立刻出现在列表里 |
| 2 | 列表展示 | 只显示**当前登录用户**的书签；空状态有引导文案 |
| 3 | 搜索 | 按标题 / URL 过滤（大小写不敏感），可与标签筛选叠加 |
| 4 | 编辑 | 可改标题/描述/URL/标签 |
| 5 | 删除 | 需二次确认；删除后列表立刻更新 |
| 6 | 基础 UI | 响应式（窄屏单列、宽屏双列）；有加载与错误状态 |

**非目标（本日不做）**：分页/无限滚动、导入导出、暗黑模式开关、收藏夹、分享（都在 P1/P2）。

## 1. 关键设计决策（需要先定）

### 1.1 用 Server Actions 还是 Route Handlers？

**决定：写操作走 Server Actions；列表与搜索走 Server Component 里的直接查询。**

理由：

- 这是"本站 UI 驱动"的 CRUD，没有外部消费者；Server Actions 省掉手写 fetch/JSON/错误处理三件套，
  并且能在同一次往返里把变更后的 RSC payload 一起返回（见下 1.3），删除/新增后列表立刻更新。
- Route Handler 的 GET 也不能被 `<Suspense>` 之外的组件缓存，但相比直接查库多了一层 HTTP 自调用，
  对本项目没有收益。

**但 TASKS.md 的 Day 4 清单写的是 5 个 REST 路由。** 两种做法取舍如下，需要你拍板：

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| **A（推荐）** Server Actions + Server Component 查询 | 少一层胶水；错误处理统一；未来加乐观更新最容易 | 与 TASKS.md 原文不符；对外没有 REST 接口 |
| B 按原文实现 5 个 Route Handlers，UI 用 fetch 调 | 与清单一致；将来做浏览器扩展/移动端可复用 | 需要自己写鉴权、校验、错误映射、客户端状态；代码量约 1.5–2 倍 |
| C 两者都做 | 兼顾 | Day 4 工作量翻倍，MVP 阶段不划算 |

> 若选 A，建议同时把 TASKS.md 的 Day 4 条目改写为"Server Actions + 查询"，避免文档与实现长期不一致。

### 1.2 标签（Tag）怎么产生？

**决定：在书签表单里用「逗号分隔的标签名」输入，保存时做 `connectOrCreate`。**

- `Tag` 有 `@@unique([userId, name])`，天然支持按 (用户, 名字) 复用；
- 需要统一归一化：`trim()` + 折叠连续空白 + 去重 + 忽略大小写（避免出现 "Work" / "work" 两个标签）；
- 空标签名直接丢弃；单个标签长度与数量都要设上限（建议 30 字符 / 10 个），防滥用。
- 将来做标签自动补全时，这个输入形态可以直接换成多选组件，数据结构不用动。

### 1.3 变更之后怎么让列表刷新？

`cacheComponents` 下有两种手段（见 `node_modules/next/dist/docs/.../09-revalidating.md`）：

- `updateTag(tag)`：**只能在 Server Action 里调用**，语义是"读到自己的写入"，下一次读会等新数据。
- `refresh()`：重跑当前路由的**动态**部分，但不动任何缓存条目。**本项目列表是动态读（每次查库），
  所以写操作后用 `refresh()` 即可**，不需要给未缓存的查询打 tag。
- `revalidatePath('/dashboard')`：作用等价于按路径失效；本项目只有一个列表路由，也能用，但不如 `refresh()` 精确。

**决定：Server Action 写完调 `refresh()`。** 若后续给列表加速（用 `"use cache"` 缓存查询），
再改成 `cacheTag` + `updateTag` 的组合——届时注意 `updateTag` 的"只能在 Server Action 里调用"限制，
在 Route Handler 里要用 `revalidateTag(tag, { expire: 0 })`。

### 1.4 搜索与筛选放在哪一层？

**决定：放数据库层（`where` 条件），不要在取回后内存过滤。**

原因：书签条数会增长，内存过滤在加分页后就崩了；而且 SQLite 的 `LIKE` 已经够用。

- 关键词：`OR: [{ title: { contains: q } }, { url: { contains: q } }]`
  （SQLite 的 `LIKE` 对 ASCII 大小写不敏感；中文本来也没有大小写问题。若将来要支持
  `description` 或标签内容，再扩展 `OR` 分支并考虑加索引。）
- 标签筛选：`tags: { some: { name: tagName } }`
- 两者叠加时同处一个 `where`，天然是 AND 关系。
- 搜索词与筛选值来自 `searchParams`，属**请求期数据**，必须走第 2 节的 Suspense 结构。

### 1.5 排序与分页

- 排序：`createdAt desc`（最新在前）。若要"最近更新在前"则用 `updatedAt desc`。
- 分页：**本日不做**，但查询里先把 `take` 收口成一个常量（例如 `MAX_BOOKMARKS = 200`），
  避免将来某天列表无限增长时页面变慢；超出时在 UI 顶部提示"仅显示最近 200 条"。

## 2. cacheComponents 约束（必须遵守，否则构建失败）

沿用 Day 3 已验证的结构（见 [DECISIONS.md](../DECISIONS.md) 第 9 节）：

```
app/dashboard/page.tsx           同步外壳（可预渲染）
  └─ <Suspense fallback={<Skeleton/>}>
       └─ <BookmarkList searchParams={searchParams} />   async：内部 await auth() / searchParams / 查库
```

**禁止**：

- `export const dynamic = "force-dynamic"` 之类的段配置（会让整条路由编译失败 → [ISSUES #7](./ISSUES.md)）；
- 在页面顶层 `await auth()` / `await searchParams` / 直接查库。

**表单页面同理**：新增/编辑弹窗或页面里的 `auth()` 也要在 Suspense 内。

## 3. 数据访问层（`lib/bookmarks.ts`）

集中所有书签查询，**每个函数第一件事就是取会话并校验 `userId`**，避免把鉴权散落在各个组件里
（Next 官方推荐的 Data Access Layer 模式）。

```ts
// 约定：所有函数都从会话取 userId，绝不接受调用方传入的 userId
async function requireUserId(): Promise<string>      // 未登录直接 redirect("/signin")
export async function listBookmarks(options: { q?: string; tag?: string }): Promise<BookmarkWithTags[]>
export async function getBookmark(id: string): Promise<BookmarkWithTags | null>   // 内含 userId 过滤
export async function createBookmark(input: BookmarkInput): Promise<{ id: string }>
export async function updateBookmark(id: string, input: BookmarkInput): Promise<void>
export async function deleteBookmark(id: string): Promise<void>
export async function listTags(): Promise<{ name: string; count: number }>         // 供筛选与补全
```

**安全要点（逐条都要有对应断言）**：

1. `getBookmark` / `updateBookmark` / `deleteBookmark` 的 `where` 必须是
   `{ id, userId }` 或先查后比对——**绝不能只按 id 查**，否则登录用户能改别人的书签。
   Prisma 的 `update`/`delete` 只接受唯一键，所以做法是：先 `findFirst({ where: { id, userId } })`
   确认存在，再按 id 操作；或直接 `updateMany({ where: { id, userId }, data })` 并检查 `count`。
2. 返回值用 `select` 白名单，别把 `userId` 之外的敏感字段带出去（书签本身没有敏感字段，
   但保持习惯，避免以后加字段时泄漏）。
3. 输入校验放服务端（Server Action 里），客户端校验只是体验优化。

## 4. Server Actions（`app/actions/bookmarks.ts`）

```ts
export type BookmarkFormState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

export async function createBookmarkAction(prev, formData): Promise<BookmarkFormState>
export async function updateBookmarkAction(prev, formData): Promise<BookmarkFormState>
export async function deleteBookmarkAction(formData): Promise<void>
```

校验规则（服务端，失败时把错误回填到表单）：

| 字段 | 规则 |
| --- | --- |
| `url` | 必填；`new URL()` 可解析；协议只允许 `http:` / `https:`（挡掉 `javascript:`）；长度 ≤ 2048 |
| `title` | 必填；trim 后非空；长度 ≤ 200 |
| `description` | 可选；长度 ≤ 1000 |
| `tags` | 逗号分隔；trim + 去重（忽略大小写）；每个 ≤ 30 字符；最多 10 个 |

写完数据后调用 `refresh()` 让列表刷新（原因见 1.3）。删除与更新都要先确认目标属于当前用户，
失败时返回统一文案，**不要**把"不存在"和"无权访问"区分开（避免探测）。

## 5. UI 结构

```
app/dashboard/page.tsx                外壳 + Suspense
app/dashboard/search-bar.tsx          "use client"：搜索框与标签筛选，写入 ?q= / ?tag=
app/dashboard/bookmark-list.tsx       Server：查询 + 渲染列表/空状态
app/dashboard/bookmark-form.tsx       "use client"：新增/编辑表单（useActionState）
app/dashboard/delete-button.tsx       "use client"：二次确认 + 提交删除 action
app/dashboard/bookmark-item.tsx       Server：单条展示（标题、域名、描述、标签、时间）
```

要点：

- **搜索防抖**：输入停顿 ~300ms 再改 URL（`router.replace`），避免每个字符都触发一次服务端查询；
  用 `useSearchParams` + `useRouter`，注意 `useSearchParams` 在客户端组件里需要 `<Suspense>` 包裹。
- **表单状态**：沿用 Day 3 的 `useActionState` 模式，错误文案走同一套渲染组件。
- **删除确认**：MVP 用 `window.confirm` 即可；若要更好的体验再换成 `<dialog>`。
- **空状态**：区分"一条都没有"与"搜索无结果"两种文案，后者给"清除筛选"的入口。
- **域名展示**：从 `url` 取 `hostname` 显示，比整串 URL 更易读。
- **无障碍**：所有输入有 `<label>`；删除按钮有 `aria-label`；错误提示用 `role="alert"`（Day 3 已是这个做法）。

## 6. 验证计划（延续 Day 3 的探针模式）

新增 `scripts/verify-bookmarks-probe.mjs`，覆盖**最容易出错、且 UI 手测很难覆盖**的点：

1. **越权**：用户 A 创建书签 → 用户 B 尝试 `getBookmark` / `updateBookmark` / `deleteBookmark`，
   三个操作都必须失败或返回 null；
2. **必填校验**：空标题、空 URL、`javascript:` 协议、超长字段都要被拒；
3. **标签归一化**：`Work, work , WORK` 只产生一个标签；重复保存同一批标签不产生新行；
4. **搜索**：按标题片段、按 URL 片段、大小写混写都能命中；不匹配的返回 0 条；
5. **标签筛选**：`?tag=` 命中数量正确，且与关键词叠加时是 AND；
6. **级联清理**：删除书签后 `_BookmarkToTag` 关联行被清掉（不残留）；
7. **数据自清理**：跑完不留任何测试数据（沿用 `BASELINE == FINAL` 的断言方式）。

另外把**输入校验**抽成纯函数（`lib/bookmark-input.ts`），这样能像 `verify-auth-guards.mjs` 那样
在最便宜的层面（不需要数据库、不需要服务）先测一遍。

浏览器手测清单（人工）：

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 新增一条书签 | 立刻出现在列表顶部，无需手动刷新 |
| 2 | 提交空标题 / 非法 URL | 表单原位显示错误，不跳转 |
| 3 | 编辑标题后保存 | 列表对应条目更新 |
| 4 | 搜索标题片段 | 只显示匹配项；URL 里带 `?q=` |
| 5 | 点标签筛选 | 与关键词叠加生效 |
| 6 | 删除（确认） | 条目消失；刷新页面后仍不存在 |
| 7 | 换一个账号登录 | 看不到上一个账号的书签 |
| 8 | 窄屏（375px） | 单列布局，不出现横向滚动 |

## 7. 风险与遗留

| 风险 | 说明 / 对策 |
| --- | --- |
| `cacheComponents` 的 Suspense 约束 | 已在 Day 3 踩过并形成模式，沿用即可；新页面同样禁止段配置 |
| 越权访问 | 靠"所有查询强制带 userId"这一条纪律；用探针的第 1 项守住 |
| 搜索性能 | MVP 阶段数据量小；若变慢，先给 `title`/`url` 加索引（已有单列索引），再考虑 SQLite FTS5 |
| 无速率限制 | 注册与新增书签都没有限流，公网开放前要补（Day 5 之前） |
| 未做分页 | 用 `MAX_BOOKMARKS` 收口，超出时提示；正式分页排到 P1 |
| 与 TASKS.md 清单不一致 | 若选方案 A，需要同步改写 TASKS.md 的 Day 4 条目 |

## 8. 需要你决定的三件事

1. **接口形态**：方案 A（Server Actions，推荐）/ B（按原文实现 5 个 REST 路由）/ C（两者都做）？
2. **搜索范围**：只搜标题+URL（MVP），还是把描述与标签内容也纳入？
3. **标签输入**：逗号分隔文本框（MVP，推荐），还是直接做标签多选/自动补全组件？
