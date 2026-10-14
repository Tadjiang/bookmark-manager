// 把 prisma/migrations 下尚未执行的迁移 SQL 应用到远端 libSQL（如 Turso）。
//
// 为什么需要这个脚本：
// Prisma CLI 的 datasource.url 只认引擎内置的 scheme（file: / postgresql: 等），
// 传 libsql:// 会直接报 P1013 "The scheme is not recognized in database URL"，
// 而且当前版本的 PrismaConfig 没有 adapter 字段，没法让 CLI 走 driver adapter。
// 好在 schema 的 provider 是 sqlite，Turso 也是 SQLite，
// migrate dev 生成的迁移 SQL 可以原样套用，所以直接用它自带的 libsql 客户端执行。
//
// 用法：
//   npm run db:migrate:remote -- --url "libsql://xxx.turso.io" --token "<token>"
// 省略参数时回退到环境变量 DATABASE_URL / DATABASE_AUTH_TOKEN（本地 .env）。

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@libsql/client";
import "dotenv/config";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

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

      if (!existsSync(file)) {
        throw new Error(`迁移 ${name} 缺少 migration.sql`);
      }

      const sql = readFileSync(file, "utf8");

      return {
        name,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = args.url ?? process.env.DATABASE_URL;
  const authToken = args.authToken ?? process.env.DATABASE_AUTH_TOKEN;

  if (!url) {
    throw new Error(
      "缺少目标数据库地址。用 --url 传入，或先按 .env.example 配好 DATABASE_URL。",
    );
  }

  if (url.startsWith("file:")) {
    console.warn(
      "⚠ 目标是本地文件库。本地库由 `prisma migrate dev` 管理，通常不需要跑这个脚本。",
    );
  }

  const migrations = readMigrations();

  if (migrations.length === 0) {
    console.log("prisma/migrations 下没有迁移，无事可做。");
    return;
  }

  const client = createClient(authToken ? { url, authToken } : { url });

  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS "_applied_migrations" (
        "name" TEXT NOT NULL PRIMARY KEY,
        "checksum" TEXT NOT NULL,
        "appliedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const applied = new Map(
      (await client.execute('SELECT "name", "checksum" FROM "_applied_migrations"'))
        .rows.map((row) => [String(row.name), String(row.checksum)]),
    );

    const pending = migrations.filter((migration) => !applied.has(migration.name));

    for (const [name, checksum] of applied) {
      const current = migrations.find((migration) => migration.name === name);

      if (current && current.checksum !== checksum) {
        throw new Error(
          `迁移 ${name} 的内容与已应用的版本不一致（本地被改动过）。请先确认差异再处理。`,
        );
      }
    }

    if (pending.length === 0) {
      console.log(`目标库已是最新，共 ${migrations.length} 个迁移，无待应用项。`);
      return;
    }

    console.log(`目标：${url}`);
    console.log(`待应用 ${pending.length} 个迁移。`);

    for (const migration of pending) {
      // executeMultiple 不隐式开事务，官方建议自行用 BEGIN/COMMIT 包裹以保证原子性。
      await client.executeMultiple(`BEGIN;\n${migration.sql}\nCOMMIT;`);
      await client.execute({
        sql: 'INSERT INTO "_applied_migrations" ("name", "checksum") VALUES (?, ?)',
        args: [migration.name, migration.checksum],
      });
      console.log(`✓ ${migration.name}`);
    }

    console.log(`完成：应用了 ${pending.length} 个迁移。`);
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(`迁移失败：${error.message}`);
  process.exit(1);
});
