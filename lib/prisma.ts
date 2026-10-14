import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/app/generated/prisma/client";

// Prisma 7 不再内置查询引擎，必须显式提供 driver adapter。
// 本地开发用 SQLite 文件（file:./dev.db），线上换成远端 libSQL（如 Turso）时
// 仍是同一个 adapter，只是连接串变成 libsql:// 并额外需要 DATABASE_AUTH_TOKEN。
function createPrismaClient() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "缺少环境变量 DATABASE_URL。请参考 .env.example 创建 .env 文件。",
    );
  }

  // 远端 libSQL 需要 authToken；本地文件不需要，传 undefined 即可。
  const authToken = process.env.DATABASE_AUTH_TOKEN;

  return new PrismaClient({
    adapter: new PrismaLibSql(authToken ? { url, authToken } : { url }),
  });
}

// 开发模式下 HMR 会反复执行模块，用全局变量复用同一个实例，避免连接数暴涨。
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

// 刻意不在模块顶层创建客户端：`next build` 收集路由信息时会求值本模块的顶层代码，
// 而构建机上通常没有数据库凭据（.env 不入库，Vercel 的环境变量也未必在构建期注入），
// 顶层 throw 会让整个构建失败。改成首次真正查询时才创建，构建期就完全不需要
// DATABASE_URL；万一线上缺变量，也只会退化成请求期的 503，而不是构建红灯。
export function getPrisma() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }

  return globalForPrisma.prisma;
}
