// 远端 libSQL（Turso）自检：迁移是否真的应用了、schema 是否齐全、能不能写。
//
// 用法：
//   npm run db:verify:remote
//   npm run db:verify:remote -- --url "libsql://xxx.turso.io" --token "<token>"
//   或先在 .env 里配好 REMOTE_DATABASE_URL / REMOTE_DATABASE_AUTH_TOKEN
//
// 为什么不能只靠 `db:migrate:remote` 的输出：
// 那个脚本打印"应用了 N 个迁移"只能说明 SQL 执行没报错，证明不了表真的建全了、
// 更证明不了**能写入**（远端库满盘/只读/权限不对时，建表与写入的表现完全不同）。
// 这里按 README「自己验证数据库链路」的四层顺序走一遍，且走的是**应用同一条链路**
// （@prisma/adapter-libsql + 生成的 Prisma Client），而不是另写一套裸 SQL。
//
// 结束后打印 RESULT_OK / RESULT_FAIL，正常跑完不留任何测试数据。
//
// 注意：这个脚本会**写远端库**。虽然是可回滚的探针数据（用独立邮箱建一个临时用户，
// 结束即删），但请确认 --url 指向的是你想验的那个库。

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaLibSql } from "@prisma/adapter-libsql";
import { register } from "node:module";
import "dotenv/config";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const MARK = `probe-remote-${Date.now()}`;

function parseArgs(argv) {
  const parsed = {};

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];

    if (key === "--url" && value) {
      parsed.url = value;
      i += 1;
    } else if (key === "--token" && value) {
      parsed.authToken = value;
      i += 1;
    } else {
      throw new Error(`无法识别的参数：${key}（只支持 --url 和 --token）`);
    }
  }

  return parsed;
}

/** 读本地迁移文件，用来和远端 _applied_migrations 对账。 */
function readMigrations() {
  const dir = join(projectRoot, "prisma", "migrations");

  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const file = join(dir, name, "migration.sql");
      const sql = existsSync(file) ? readFileSync(file, "utf8") : "";

      return { name, checksum: createHash("sha256").update(sql).digest("hex") };
    });
}

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`RESULT_FAIL ${error.message}`);
  process.exit(1);
}

const url = args.url ?? process.env.REMOTE_DATABASE_URL;
const authToken = args.authToken ?? process.env.REMOTE_DATABASE_AUTH_TOKEN;

if (!url) {
  console.error(
    "RESULT_FAIL 缺少目标地址。用 --url 传入，或在 .env 里配好 REMOTE_DATABASE_URL（见 .env.example）。",
  );
  process.exit(1);
}

if (url.startsWith("file:")) {
  console.error(
    "RESULT_FAIL 目标看起来是本地文件库（file:）。本地库请用 node scripts/verify-day2-probe.mjs。",
  );
  process.exit(1);
}

// 生成的客户端用无扩展名相对导入，必须先补扩展名 hook。
register("./prisma-esm-hook.mjs", import.meta.url);

const { PrismaClient } = await import("../app/generated/prisma/client.ts");
const prisma = new PrismaClient({ adapter: new PrismaLibSql(authToken ? { url, authToken } : { url }) });

let failures = 0;
let probeUserId;

function assert(label, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);

  if (!condition) {
    failures += 1;
  }
}

const counts = () =>
  Promise.all([prisma.user.count(), prisma.bookmark.count(), prisma.tag.count()]);

try {
  // 不要把 token 打出来——日志会被贴进 issue / 终端历史。
  console.log(`REMOTE_URL=${url}`);

  // ---------- 第 1 层：连得上吗 ----------
  await prisma.$queryRawUnsafe("SELECT 1");
  assert("能连上远端库", true);

  // ---------- 第 2 层：schema / 迁移 ----------
  const tables = (
    await prisma.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
  ).map((row) => String(row.name));

  console.log(`TABLES=${tables.join(",")}`);

  const expectedTables = [
    "Account",
    "Bookmark",
    "Session",
    "Tag",
    "User",
    "VerificationToken",
    "_BookmarkToTag",
  ];
  const missingTables = expectedTables.filter((name) => !tables.includes(name));

  assert(
    "schema 齐全（6 张业务表 + 1 张连接表）",
    missingTables.length === 0,
    missingTables.length > 0 ? `缺 ${missingTables.join(",")}` : "",
  );

  const localMigrations = readMigrations();

  if (!tables.includes("_applied_migrations")) {
    assert(
      "远端有 _applied_migrations 记录表",
      false,
      "没跑过 npm run db:migrate:remote",
    );
  } else {
    const applied = new Map(
      (
        await prisma.$queryRawUnsafe('SELECT "name", "checksum" FROM "_applied_migrations"')
      ).map((row) => [String(row.name), String(row.checksum)]),
    );

    const pending = localMigrations.filter((migration) => !applied.has(migration.name));
    const drifted = localMigrations.filter(
      (migration) => applied.has(migration.name) && applied.get(migration.name) !== migration.checksum,
    );

    assert(
      `远端迁移与本地一致（共 ${localMigrations.length} 个）`,
      pending.length === 0 && drifted.length === 0,
      pending.length > 0
        ? `待应用 ${pending.map((m) => m.name).join(",")}`
        : drifted.length > 0
          ? `checksum 不一致 ${drifted.map((m) => m.name).join(",")}`
          : "",
    );
  }

  // ---------- 第 3 层：只读查表 ----------
  const before = await counts();
  console.log(`BASELINE users=${before[0]} bookmarks=${before[1]} tags=${before[2]}`);

  // ---------- 第 4 层：写入 ----------
  const user = await prisma.user.create({
    data: { email: `${MARK}@example.com`, name: MARK },
    select: { id: true },
  });
  probeUserId = user.id;

  const tag = await prisma.tag.create({
    data: { userId: user.id, name: `${MARK}-tag` },
    select: { id: true },
  });

  const bookmark = await prisma.bookmark.create({
    data: {
      userId: user.id,
      url: `https://example.com/${MARK}`,
      title: `${MARK} 写入探针`,
      tags: { connect: [{ id: tag.id }] },
    },
    select: { id: true },
  });

  const readBack = await prisma.bookmark.findFirst({
    where: { id: bookmark.id, userId: user.id },
    select: { id: true, title: true, tags: { select: { name: true } } },
  });

  assert(
    "写入并读回（含多对多关联）",
    readBack?.tags.length === 1 && readBack.tags[0].name === `${MARK}-tag`,
  );

  const searched = await prisma.bookmark.count({
    where: { userId: user.id, OR: [{ title: { contains: MARK } }, { url: { contains: MARK } }] },
  });
  assert("按标题/URL 搜索命中", searched === 1, `实际 ${searched}`);

  // ---------- 清理 + 级联 ----------
  await prisma.user.delete({ where: { id: user.id } });
  probeUserId = undefined;

  const leftovers = await Promise.all([
    prisma.bookmark.count({ where: { title: { contains: MARK } } }),
    prisma.tag.count({ where: { name: `${MARK}-tag` } }),
  ]);
  assert(
    "删除用户后书签与标签被级联清掉",
    leftovers[0] === 0 && leftovers[1] === 0,
    `残留 bookmarks=${leftovers[0]} tags=${leftovers[1]}`,
  );

  const after = await counts();
  console.log(`FINAL users=${after[0]} bookmarks=${after[1]} tags=${after[2]}`);
  assert("行数回到基线", after.join() === before.join(), `${before.join()} -> ${after.join()}`);

  console.log(`\n${failures === 0 ? "RESULT_OK" : `RESULT_FAIL ${failures} 项未通过`}`);
  process.exitCode = failures === 0 ? 0 : 1;
} catch (error) {
  console.error(`RESULT_FAIL ${error.message}`);
  process.exitCode = 1;
} finally {
  if (probeUserId) {
    try {
      await prisma.user.delete({ where: { id: probeUserId } });
      console.error("CLEANUP_OK 已回滚本次创建的探针数据");
    } catch (cleanupError) {
      console.error(`CLEANUP_FAIL ${cleanupError.message}（请手动删掉 ${MARK} 用户）`);
    }
  }

  await prisma.$disconnect();
}
