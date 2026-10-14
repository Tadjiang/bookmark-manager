import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/app/generated/prisma/client";

// Prisma 7 不再内置查询引擎，必须显式提供 driver adapter。
// 本地开发用 SQLite 文件，部署时换成 @prisma/adapter-pg 即可。
function createPrismaClient() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "缺少环境变量 DATABASE_URL。请参考 .env.example 创建 .env 文件。",
    );
  }

  return new PrismaClient({
    adapter: new PrismaLibSql({ url }),
  });
}

// 开发模式下 HMR 会反复执行模块，用全局变量复用同一个实例，避免连接数暴涨。
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
