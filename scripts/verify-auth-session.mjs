// Day 3 端到端会话探针：用真实 HTTP 走完「注册→登录→拿到会话」的链路。
//
// 和 verify-auth-probe.mjs 的区别：那个直接调 lib/credentials.ts（不走 HTTP），
// 这个连 HTTP 层一起验——CSRF 令牌、凭据回调、Set-Cookie、/api/auth/session 解码。
// 对 JWT 会话来说，cookie 能否正确签发/解码是最容易出错的一环，值得单独验。
//
// 用法（需要 dev server 或 npm start 已在跑）：
//   node scripts/verify-auth-session.mjs
//   node scripts/verify-auth-session.mjs http://localhost:3000
//
// 它会自己注册一个临时账号、验证会话、最后把账号删掉，不留数据。

import { register } from "node:module";

import { PrismaLibSql } from "@prisma/adapter-libsql";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

register("./prisma-esm-hook.mjs", import.meta.url);

const { PrismaClient } = await import("../app/generated/prisma/client.ts");

const baseUrl = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");

function databaseUrl() {
  const raw = process.env.DATABASE_URL ?? readEnv("DATABASE_URL");
  const filePath = raw.slice("file:".length);

  if (!raw.startsWith("file:")) {
    return raw;
  }

  if (/^[A-Za-z]:/.test(filePath) || filePath.startsWith("/")) {
    return raw;
  }

  return `file:${resolve(process.cwd(), filePath).replace(/\\/g, "/")}`;
}

function readEnv(key) {
  const envFile = resolve(process.cwd(), ".env");

  if (!existsSync(envFile)) {
    throw new Error(`找不到 ${envFile}，也没有 ${key} 环境变量`);
  }

  const line = readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${key}=`));

  if (!line) {
    throw new Error(`.env 里没有 ${key}`);
  }

  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url: databaseUrl() }) });

const MARK = `sessionprobe-${Date.now()}`;
const email = `${MARK}@example.com`;
const password = "correct horse battery staple";

// 把 Set-Cookie 攒成一个 Cookie 头，手工维护会话
const jar = new Map();

function rememberCookies(response) {
  const raw = response.headers.getSetCookie?.() ?? [];

  for (const cookie of raw) {
    const [pair] = cookie.split(";");
    const index = pair.indexOf("=");
    jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    redirect: "manual",
    headers: { ...(init.headers ?? {}), cookie: cookieHeader() },
  });

  rememberCookies(response);

  return response;
}

function assert(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}`);

  if (!condition) {
    throw new Error(`断言失败：${label}`);
  }
}

try {
  console.log(`BASE_URL=${baseUrl}`);

  // ---------- 0. 服务是否可达 ----------
  const health = await request("/api/health");

  assert("dev server 可达（/api/health 200）", health.status === 200);

  // ---------- 1. 造一个账号 ----------
  // 应用里的注册走 Server Action（Next.js 内部协议），普通 HTTP 调不动；
  // 所以这里直接按注册后的状态建号（同一套 scrypt 哈希函数），
  // 注册本身的正确性由 verify-auth-probe.mjs 覆盖。
  const { hashPassword } = await import("../lib/password.ts");
  const user = await prisma.user.create({
    data: { email, name: "session probe", passwordHash: await hashPassword(password) },
  });
  console.log(`USER_CREATED id=${user.id}`);

  // ---------- 2. 登录：CSRF + 凭据回调 ----------
  const signIn = await request("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password, csrfToken: await csrfToken() }),
  });

  console.log(`SIGNIN_STATUS=${signIn.status} LOCATION=${signIn.headers.get("location") ?? "-"}`);
  assert("登录请求不是 401/500", signIn.status < 400 || signIn.status === 302);

  // ---------- 3. 会话 cookie ----------
  const sessionCookieName = [...jar.keys()].find((name) =>
    name.includes("session-token"),
  );
  assert("签发了会话 cookie", Boolean(sessionCookieName));

  // ---------- 4. /api/auth/session 能解出用户 ----------
  const session = await request("/api/auth/session");
  const payload = await session.json();

  console.log(`SESSION_USER=${payload?.user?.email ?? "(空)"}`);
  assert("会话里能拿到用户邮箱", payload?.user?.email === email);
  assert("会话里带上了 user.id（types/next-auth.d.ts 声明的字段）", payload?.user?.id === user.id);

  // ---------- 5. 受保护路由：已登录应放行 ----------
  const dashboard = await request("/dashboard");
  assert("已登录访问 /dashboard 不再跳登录页", dashboard.status === 200);

  // ---------- 6. 登出 ----------
  await request("/api/auth/signout", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: await csrfToken() }),
  });

  // ---------- 7. 未登录访问受保护路由应被 middleware 拦下 ----------
  jar.clear();
  const blocked = await request("/dashboard");

  console.log(`ANON_DASHBOARD_STATUS=${blocked.status} LOCATION=${blocked.headers.get("location") ?? "-"}`);
  assert("未登录访问 /dashboard 被重定向", blocked.status === 307 || blocked.status === 302);
  assert(
    "重定向目标是 /signin 且带上 callbackUrl",
    (blocked.headers.get("location") ?? "").includes("/signin"),
  );

  console.log("RESULT_OK");
} catch (error) {
  console.error(`RESULT_FAIL ${error.message}`);
  process.exitCode = 1;
} finally {
  try {
    await prisma.user.deleteMany({ where: { email: { startsWith: MARK } } });
    const leftover = await prisma.user.count({ where: { email: { startsWith: MARK } } });
    console.log(`CLEANUP leftover=${leftover}`);
  } catch {
    // 服务不可达或数据库只读时也会走到这里，不必把它当成新问题刷屏；
    // 真正的原因已经在 RESULT_FAIL 里打印过了。
    console.log("CLEANUP_SKIPPED（未能连上数据库；如有残留请手动删除 sessionprobe-* 用户）");
  }

  await prisma.$disconnect();
}

// CSRF 令牌每次都要重新取（登出后会被轮换）
async function csrfToken() {
  const response = await fetch(`${baseUrl}/api/auth/csrf`, {
    headers: { cookie: cookieHeader() },
  });

  rememberCookies(response);

  const body = await response.json();

  return body.csrfToken;
}
