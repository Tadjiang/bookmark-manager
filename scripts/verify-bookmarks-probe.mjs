// Day 4 探针：书签 CRUD 里"UI 手测很难覆盖、错了又很致命"的部分。
//
// 用法：
//   node scripts/verify-bookmarks-probe.mjs
//
// 覆盖：
//   1. 越权：用户 B 不能读到 / 改到 / 删掉用户 A 的书签
//   2. 标签：按 (userId, name) upsert 幂等，重复保存同一批标签不产生新行
//   3. 搜索：标题片段 / URL 片段 / ASCII 大小写混写都能命中；不匹配返回 0 条
//   4. 标签筛选：命中数量正确，且与关键词叠加时是 AND
//   5. 关联清理：删除书签后 _BookmarkToTag 里的关联行被清掉，不残留
//   6. 数据自清理：跑完行数回到基线（BASELINE == FINAL）
//
// **覆盖边界（别误读）**：这个脚本走的是 Prisma 客户端 + 与 lib/bookmarks.ts 相同的查询形状，
// 而不是 import 那个模块本身——`lib/bookmarks.ts` 依赖 `@/auth` 与 `next/navigation`，
// 在纯 Node 下加载不了。所以"数据访问层确实用了这些带 userId 的条件"这一条，
// 由 scripts/verify-bookmark-input.mjs 第 5 节的静态护栏来守，两者合起来才算完整。
// 不依赖 Next.js，也不需要 dev server 在跑。

import { existsSync } from "node:fs";
import { register } from "node:module";

import { PrismaLibSql } from "@prisma/adapter-libsql";

import { resolveDatabaseUrl } from "./lib/db-url.mjs";

// 生成的 Prisma 客户端用的是无扩展名相对导入（./enums 这种），是给 Turbopack 用的写法，
// Node 的 ESM 解析器认不了，所以先挂一个补扩展名的 hook。必须在 import 客户端之前注册。
register("./prisma-esm-hook.mjs", import.meta.url);

const MARK = `probe4-${Date.now()}`;
const url = resolveDatabaseUrl();

if (url.startsWith("file:")) {
  const dbFile = url.slice("file:".length);

  if (!existsSync(dbFile)) {
    console.error(`RESULT_FAIL 数据库文件不存在：${dbFile}。先跑 npx prisma migrate dev。`);
    process.exit(1);
  }
}

const { PrismaClient } = await import("../app/generated/prisma/client.ts");
const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });

let failures = 0;
const createdUserIds = [];

function assert(label, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);

  if (!condition) {
    failures += 1;
  }
}

const counts = () =>
  Promise.all([prisma.user.count(), prisma.bookmark.count(), prisma.tag.count()]);

/** 按 (userId, name) 复用标签行——与 lib/bookmarks.ts 的 ensureTags 同一套语义。 */
const upsertTag = (userId, name) =>
  prisma.tag.upsert({
    where: { userId_name: { userId, name } },
    create: { userId, name },
    update: {},
    select: { id: true },
  });

async function linkCountFor(bookmarkId) {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT COUNT(*) AS c FROM _BookmarkToTag WHERE A = ?",
    bookmarkId,
  );

  return Number(rows[0].c);
}

try {
  console.log(`DATABASE_URL=${url}`);

  const before = await counts();
  console.log(`BASELINE users=${before[0]} bookmarks=${before[1]} tags=${before[2]}`);

  // ---------- 0. 隐式多对多连接表存在且列名符合预期 ----------
  const linkColumns = (
    await prisma.$queryRawUnsafe("PRAGMA table_info('_BookmarkToTag')")
  ).map((row) => row.name);

  assert(
    "_BookmarkToTag 存在且列为 A/B（模型名字母序）",
    linkColumns.includes("A") && linkColumns.includes("B"),
    linkColumns.join(","),
  );

  // ---------- 1. 造两个用户；A 建标签 + 书签 ----------
  const userA = await prisma.user.create({
    data: { email: `${MARK}-a@example.com`, name: `${MARK}-a` },
    select: { id: true },
  });
  createdUserIds.push(userA.id);

  const userB = await prisma.user.create({
    data: { email: `${MARK}-b@example.com`, name: `${MARK}-b` },
    select: { id: true },
  });
  createdUserIds.push(userB.id);

  const workTag = await upsertTag(userA.id, "work");

  const created = await prisma.bookmark.create({
    data: {
      userId: userA.id,
      url: `https://example.com/${MARK}/Hello`,
      title: `${MARK} Hello World`,
      description: "探针数据，脚本结束会删掉",
      tags: { connect: [{ id: workTag.id }] },
    },
    select: { id: true },
  });

  console.log(`WRITE_OK userA=${userA.id} userB=${userB.id} bookmark=${created.id}`);

  // ---------- 2. 越权 ----------
  const bReadsA = await prisma.bookmark.findFirst({
    where: { id: created.id, userId: userB.id },
    select: { id: true },
  });
  assert("B 读不到 A 的书签（findFirst 带 userId）", bReadsA === null);

  const bDeletesA = await prisma.bookmark.deleteMany({
    where: { id: created.id, userId: userB.id },
  });
  assert("B 删不掉 A 的书签（deleteMany 带 userId）", bDeletesA.count === 0);

  const bUpdatesA = await prisma.bookmark.updateMany({
    where: { id: created.id, userId: userB.id },
    data: { title: "被 B 改掉了" },
  });
  assert("B 改不了 A 的书签（updateMany 带 userId）", bUpdatesA.count === 0);

  const aStillThere = await prisma.bookmark.findFirst({
    where: { id: created.id, userId: userA.id },
    select: { title: true },
  });
  assert(
    "三次越权尝试后 A 的书签完好无损",
    aStillThere?.title === `${MARK} Hello World`,
  );

  // ---------- 3. 标签幂等 ----------
  await upsertTag(userA.id, "work");
  await upsertTag(userA.id, "work");

  const workTagRows = await prisma.tag.count({ where: { userId: userA.id, name: "work" } });
  assert("重复 upsert 同一标签仍只有一行", workTagRows === 1);

  const otherTag = await upsertTag(userA.id, "reading");
  await prisma.bookmark.update({
    where: { id: created.id },
    data: { tags: { set: [{ id: workTag.id }, { id: otherTag.id }] } },
  });

  const tagTotalA = await prisma.tag.count({ where: { userId: userA.id } });
  assert("A 名下共 2 个标签", tagTotalA === 2, `实际 ${tagTotalA}`);

  // 同一个标签名对 B 来说是另一行（唯一约束是 (userId, name)，不是全局唯一）。
  await upsertTag(userB.id, "work");
  const workTagGlobal = await prisma.tag.count({ where: { name: "work" } });
  assert("work 标签在两个用户名下各一行", workTagGlobal === 2, `实际 ${workTagGlobal}`);

  // ---------- 4. 搜索（title / url / 大小写） ----------
  const byTitle = await prisma.bookmark.count({
    where: { userId: userA.id, OR: [{ title: { contains: MARK } }, { url: { contains: MARK } }] },
  });
  assert("按标题片段命中", byTitle === 1, `实际 ${byTitle}`);

  const byUrl = await prisma.bookmark.count({
    where: { userId: userA.id, OR: [{ title: { contains: "/Hello" } }, { url: { contains: "/Hello" } }] },
  });
  assert("按 URL 片段命中", byUrl === 1, `实际 ${byUrl}`);

  const byLowercase = await prisma.bookmark.count({
    where: { userId: userA.id, OR: [{ title: { contains: "hello world" } }, { url: { contains: "hello world" } }] },
  });
  assert("大小写混写仍命中（SQLite LIKE 对 ASCII 不敏感）", byLowercase === 1, `实际 ${byLowercase}`);

  const noMatch = await prisma.bookmark.count({
    where: { userId: userA.id, OR: [{ title: { contains: `${MARK}-nope` } }, { url: { contains: `${MARK}-nope` } }] },
  });
  assert("不匹配的关键词返回 0 条", noMatch === 0, `实际 ${noMatch}`);

  const otherUsersRows = await prisma.bookmark.count({
    where: { userId: userB.id, OR: [{ title: { contains: MARK } }, { url: { contains: MARK } }] },
  });
  assert("关键词搜索不会跨用户命中", otherUsersRows === 0, `实际 ${otherUsersRows}`);

  // ---------- 5. 标签筛选（单独 & 与关键词叠加） ----------
  const byTag = await prisma.bookmark.count({
    where: { userId: userA.id, tags: { some: { name: "work" } } },
  });
  assert("按标签筛选命中", byTag === 1, `实际 ${byTag}`);

  const byTagAndKeyword = await prisma.bookmark.count({
    where: {
      userId: userA.id,
      OR: [{ title: { contains: MARK } }, { url: { contains: MARK } }],
      tags: { some: { name: "work" } },
    },
  });
  assert("标签 + 关键词叠加是 AND（同时满足才命中）", byTagAndKeyword === 1, `实际 ${byTagAndKeyword}`);

  const tagAndWrongKeyword = await prisma.bookmark.count({
    where: {
      userId: userA.id,
      OR: [{ title: { contains: `${MARK}-nope` } }, { url: { contains: `${MARK}-nope` } }],
      tags: { some: { name: "work" } },
    },
  });
  assert("标签命中但关键词不命中 → 0 条", tagAndWrongKeyword === 0, `实际 ${tagAndWrongKeyword}`);

  const unusedTag = await prisma.bookmark.count({
    where: { userId: userA.id, tags: { some: { name: `${MARK}-unused` } } },
  });
  assert("不存在的标签筛选返回 0 条", unusedTag === 0, `实际 ${unusedTag}`);

  // ---------- 6. 关联清理 ----------
  const linksBefore = await linkCountFor(created.id);
  assert("删除前书签有 2 条标签关联", linksBefore === 2, `实际 ${linksBefore}`);

  const removed = await prisma.bookmark.deleteMany({ where: { id: created.id, userId: userA.id } });
  assert("本人删除成功", removed.count === 1, `实际 ${removed.count}`);

  const linksAfter = await linkCountFor(created.id);
  assert("删除后 _BookmarkToTag 不残留关联行", linksAfter === 0, `实际 ${linksAfter}`);

  const tagsSurvive = await prisma.tag.count({ where: { userId: userA.id } });
  assert("标签行本身保留（不随书签一起删）", tagsSurvive === 2, `实际 ${tagsSurvive}`);

  // ---------- 7. 数据自清理 ----------
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdUserIds.length = 0;

  const after = await counts();
  console.log(`FINAL users=${after[0]} bookmarks=${after[1]} tags=${after[2]}`);

  const leftover = await prisma.bookmark.count({ where: { title: { contains: MARK } } });
  assert("测试数据已清空", leftover === 0, `实际 ${leftover}`);
  assert("行数回到基线", after.join() === before.join(), `${before.join()} -> ${after.join()}`);

  console.log(`\n${failures === 0 ? "RESULT_OK" : `RESULT_FAIL ${failures} 项未通过`}`);
  process.exitCode = failures === 0 ? 0 : 1;
} catch (error) {
  console.error(`RESULT_FAIL ${error.message}`);
  failures += 1;
  process.exitCode = 1;
} finally {
  // 异常路径也要尽量把自己造的数据清掉（删除用户会级联掉书签与标签）。
  if (createdUserIds.length > 0) {
    try {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      console.error("CLEANUP_OK 已回滚本次创建的测试数据");
    } catch (cleanupError) {
      console.error(`CLEANUP_FAIL ${cleanupError.message}（请手动删掉 ${MARK} 开头的用户）`);
    }
  }

  await prisma.$disconnect();
}
