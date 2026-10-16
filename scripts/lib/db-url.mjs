// 给仓库内探针脚本共用的小工具：定位数据库连接串。
//
// 为什么需要：应用运行时（Next.js）用的是 Prisma 自己的解析规则，
// 但独立的 node 脚本走 @libsql/client，它对 `file:./dev.db` 这种相对路径
// 会按"当前工作目录"解析——只要脚本不是从仓库根目录启动，就会连到错误的库
// （甚至凭空建一个空库，这是最危险的：看起来一切正常，其实查的是空表）。
// 所以这里统一把相对路径解析成绝对路径。
//
// 只在脚本里用，不进入应用代码。

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 把 `file:./dev.db` 之类的连接串解析成绝对路径形式。
 * 非 file: 协议（如远端 libsql://）原样返回。
 */
export function toAbsoluteDatabaseUrl(raw, cwd = process.cwd()) {
  const value = String(raw ?? "").trim().replace(/^["']|["']$/g, "");

  if (!value.startsWith("file:")) {
    return value;
  }

  const filePath = value.slice("file:".length);

  if (filePath === ":memory:") {
    return value;
  }

  // Windows 绝对路径必须形如 D:\ 或 D:/（冒号后紧跟斜杠）。
  // 只判断 /^[A-Za-z]:/ 会把 `./dev.db` 里的点当成盘符，
  // 于是相对路径被误判成绝对路径、原样返回——这个 bug 真的踩过。
  const isAbsolute = /^[A-Za-z]:[\\/]/.test(filePath) || filePath.startsWith("/");

  if (isAbsolute) {
    return value;
  }

  return `file:${resolve(cwd, filePath).replace(/\\/g, "/")}`;
}

/** 从 .env 里读一个变量（末尾引号会被去掉）。找不到则返回 undefined。 */
export function readEnvFile(key, cwd = process.cwd()) {
  const envFile = resolve(cwd, ".env");

  if (!existsSync(envFile)) {
    return undefined;
  }

  const line = readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${key}=`));

  if (!line) {
    return undefined;
  }

  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

/**
 * 取数据库连接串：环境变量优先，其次 .env，最后统一规范化成绝对路径。
 *
 * 注意环境变量本身也可能是相对路径（例如外部工具预先导出的 `file:./dev.db`），
 * 所以规范化必须作用在两个来源上，不能只在读 .env 的分支里做。
 */
export function resolveDatabaseUrl(cwd = process.cwd()) {
  const raw = process.env.DATABASE_URL ?? readEnvFile("DATABASE_URL", cwd);

  if (!raw) {
    throw new Error("没有 DATABASE_URL：既没有环境变量，也没有在 .env 里找到。");
  }

  return toAbsoluteDatabaseUrl(raw, cwd);
}
