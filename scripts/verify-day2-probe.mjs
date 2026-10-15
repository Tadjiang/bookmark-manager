// Day 2 验证探针：确认「Prisma Client + libsql driver adapter + dev.db」的写入链路真的通。
//
// 为什么需要它：`/api/health` 只做 count()，是只读的——就算数据库是只读的
// （SQLITE_READONLY），它照样返回 ok:true。所以写入、关联、级联删除必须单独验。
//
// 用法：
//   node scripts/verify-day2-probe.mjs
//
// 它会：建 1 个 user + 1 个 tag + 1 个 bookmark（带关联）→ 读回关联 → 按标题/URL 搜索
//      → 删掉 user → 确认 bookmark 和 tag 被级联清掉 → 确认行数回到初始值。
// 结束时会打印 RESULT_OK（成功）或 RESULT_FAIL + 原因（失败），正常跑完不留任何测试数据。
// 不依赖 Next.js，也不需要 dev server 在跑（但 SQLite 是文件锁，别和别的写入进程抢）。

import { existsSync, readFileSync } from "node:fs";
import { register } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaLibSql } from "@prisma/adapter-libsql";

// 生成的 Prisma 客户端用的是无扩展名相对导入（./enums 这种），那是给 Turbopack
// 解析的写法，Node 的 ESM 解析器认不了，所以先挂一个补扩展名的 hook。
// 必须在 import 那个客户端之前注册。
register("./prisma-esm-hook.mjs", import.meta.url);

const MARK = `probe-${Date.now()}`;
const root = dirname(dirname(fileURLToPath(import.meta.url)));

// 直接读 .env，免得依赖用户有没有先 export DATABASE_URL（.env 不入库，缺失也正常）。
function readDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const envFile = join(root, ".env");

  if (!existsSync(envFile)) {
    throw new Error(`没有 DATABASE_URL，也找不到 ${envFile}。参考 .env.example 建一个。`);
  }

  const line = readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith("DATABASE_URL"));

  if (!line) {
    throw new Error(".env 里没有 DATABASE_URL。参考 .env.example 补上。");
  }

  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

// 连接串写法是 `file:./dev.db`，相对路径按项目根目录解析（与 prisma7.config.ts 一致）。
// libsql 对相对路径的解析基准容易踩坑，这里统一换成绝对路径。
function toAbsoluteUrl(url) {
  if (!url.startsWith("file:")) {
    return url;
  }

  const filePath = url.slice("file:".length);

  if (filePath === ":memory:" || isAbsolute(filePath)) {
    return url;
  }

  return `file:${resolve(root, filePath).replace(/\\/g, "/")}`;
}

const url = toAbsoluteUrl(readDatabaseUrl());
const { PrismaClient } = await import("../app/generated/prisma/client.ts");
const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });

const counts = () =>
  Promise.all([prisma.user.count(), prisma.bookmark.count(), prisma.tag.count()]);

let userId;

try {
  console.log(`DATABASE_URL=${url}`);

  if (url.startsWith("file:")) {
    const dbFile = url.slice("file:".length);

    console.log(`DB_EXISTS=${existsSync(dbFile)}`);

    if (!existsSync(dbFile)) {
      throw new Error(`数据库文件不存在：${dbFile}。先跑 npx prisma migrate dev。`);
    }
  }

  // ---------- 1. 表结构 + 只读链路（应与 /api/health 的数字一致） ----------
  const tables = await prisma.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const tableNames = tables.map((row) => row.name);
  console.log(`TABLES=${tableNames.join(",")}`);

  const expected = ["Account", "Bookmark", "Session", "Tag", "User", "VerificationToken"];
  const missing = expected.filter((name) => !tableNames.includes(name));

  if (missing.length > 0) {
    throw new Error(`缺少数据表：${missing.join(",")}。Day 2 的迁移没应用成功。`);
  }

  const before = await counts();
  console.log(`BASELINE users=${before[0]} bookmarks=${before[1]} tags=${before[2]}`);

  // ---------- 2. 写入：user + tag + bookmark（带关联） ----------
  const email = `${MARK}@example.com`;
  const tagName = `${MARK}-tag`;

  const user = await prisma.user.create({ data: { email, name: MARK } });
  userId = user.id;
  const tag = await prisma.tag.create({ data: { name: tagName, userId: user.id } });
  const bookmark = await prisma.bookmark.create({
    data: {
      url: `https://example.com/${MARK}`,
      title: MARK,
      description: "由 verify-day2-probe.mjs 创建，脚本结束时会删除",
      userId: user.id,
      tags: { connect: [{ id: tag.id }] },
    },
  });
  console.log(`WRITE_OK user=${user.id} tag=${tag.id} bookmark=${bookmark.id}`);

  // ---------- 3. 读回关联 ----------
  const readBack = await prisma.bookmark.findUnique({
    where: { id: bookmark.id },
    include: { tags: true, user: true },
  });

  if (!readBack || readBack.tags.length !== 1 || readBack.user.email !== email) {
    throw new Error("读回的书签关联不正确（tags/user 对不上）。");
  }

  console.log(`RELATION_OK tags=${readBack.tags.length} owner_matches=true`);

  // ---------- 4. 搜索（Day 2 版本：title/url 的 contains） ----------
  const matched = await prisma.bookmark.count({
    where: {
      userId: user.id,
      OR: [{ title: { contains: MARK } }, { url: { contains: MARK } }],
    },
  });

  if (matched !== 1) {
    throw new Error(`按标题/URL 搜索命中 ${matched} 条，期望 1 条。`);
  }

  console.log("SEARCH_OK matched=1");

  // ---------- 5. 删除 + 级联 ----------
  await prisma.user.delete({ where: { id: user.id } });
  userId = undefined;

  const leftover = await Promise.all([
    prisma.bookmark.count({ where: { title: MARK } }),
    prisma.tag.count({ where: { name: tagName } }),
  ]);

  if (leftover[0] !== 0 || leftover[1] !== 0) {
    throw new Error(
      `级联删除没生效：残留 bookmarks=${leftover[0]} tags=${leftover[1]}（外键 onDelete: Cascade 有问题）`,
    );
  }

  console.log("CASCADE_OK leftover_bookmarks=0 leftover_tags=0");

  // ---------- 6. 行数复原 ----------
  const after = await counts();
  console.log(`FINAL users=${after[0]} bookmarks=${after[1]} tags=${after[2]}`);

  if (after.join() !== before.join()) {
    throw new Error(`行数没复原：${before.join()} -> ${after.join()}`);
  }

  console.log("RESULT_OK");
} catch (error) {
  console.error(`RESULT_FAIL ${error.message}`);

  // 失败时尽量把自己造的数据清掉，避免留下垃圾。
  if (userId) {
    try {
      await prisma.user.delete({ where: { id: userId } });
      console.error("CLEANUP_OK 已回滚本次创建的测试数据");
    } catch (cleanupError) {
      console.error(`CLEANUP_FAIL ${cleanupError.message}（请手动删掉 ${MARK} 相关数据）`);
    }
  }

  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
