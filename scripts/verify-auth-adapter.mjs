// Adapter 契约探针：确认 @auth/prisma-adapter 期望的每个方法，都能在我们这套
// Prisma 7 + libsql + schema 上真正跑通。
//
// 为什么值得单独验：官方 adapter 的 peerDependencies 只声明到 @prisma/client >=6，
// 而本项目用的是 Prisma 7（查询引擎被移除、客户端形状有变）。类型层面不一定报错，
// 但运行时某个方法一旦对不上（例如少一张表、复合唯一键名字不对），
// 就会在"用户点 GitHub 登录"的那一刻才炸——那种失败最难排查。
//
// 用法（先停掉 dev server，SQLite 是文件锁）：
//   node scripts/verify-auth-adapter.mjs
//
// 全程真实读写 dev.db，结束时会把自己造的数据删干净。

import { register } from "node:module";

import { PrismaAdapter } from "@auth/prisma-adapter";
import { PrismaLibSql } from "@prisma/adapter-libsql";

import { resolveDatabaseUrl } from "./lib/db-url.mjs";

register("./prisma-esm-hook.mjs", import.meta.url);

const { PrismaClient } = await import("../app/generated/prisma/client.ts");

const url = resolveDatabaseUrl();
const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
const adapter = PrismaAdapter(prisma);

const MARK = `adapter-${Date.now()}`;

let failures = 0;

function assert(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}`);

  if (!condition) {
    failures += 1;
  }
}

try {
  console.log(`DATABASE_URL=${url}`);

  // ---------- 1. 方法齐全性 ----------
  const required = [
    "createUser",
    "getUser",
    "getUserByEmail",
    "getUserByAccount",
    "updateUser",
    "deleteUser",
    "linkAccount",
    "unlinkAccount",
    "getSessionAndUser",
    "createSession",
    "updateSession",
    "deleteSession",
    "createVerificationToken",
    "useVerificationToken",
  ];

  const missing = required.filter((name) => typeof adapter[name] !== "function");
  assert(`adapter 提供全部 ${required.length} 个必需方法`, missing.length === 0);

  if (missing.length > 0) {
    console.log(`MISSING=${missing.join(",")}`);
  }

  // ---------- 2. 注册流程用到的：createUser / getUser / getUserByEmail / updateUser ----------
  const email = `${MARK}@example.com`;

  const created = await adapter.createUser({
    // 故意带上 id: undefined：adapter 内部会 stripUndefined，让数据库自己生成 cuid。
    // 这条路径正是 Auth.js 注册 OAuth 用户时走的。
    ...{ id: undefined },
    email,
    name: "adapter probe",
    emailVerified: null,
    image: null,
  });
  assert("createUser 返回带 id 的用户", Boolean(created.id));
  assert("createUser 落库的邮箱正确", created.email === email);

  const fetched = await adapter.getUser(created.id);
  assert("getUser 能按 id 取回", fetched?.id === created.id);

  const byEmail = await adapter.getUserByEmail(email);
  assert("getUserByEmail 能按邮箱取回", byEmail?.id === created.id);

  const updated = await adapter.updateUser({ id: created.id, name: "renamed" });
  assert("updateUser 能更新字段", updated.name === "renamed");

  const noAccount = await adapter.getUserByAccount({
    provider: "github",
    providerAccountId: `${MARK}-gh`,
  });
  assert("getUserByAccount 在无绑定时返回 null", noAccount === null);

  // ---------- 3. OAuth 首登用到的：linkAccount + getUserByAccount ----------
  const account = await adapter.linkAccount({
    userId: created.id,
    type: "oauth",
    provider: "github",
    providerAccountId: `${MARK}-gh`,
    access_token: "fake-token",
    token_type: "bearer",
    scope: "read:user",
  });
  assert("linkAccount 成功", account?.providerAccountId === `${MARK}-gh`);

  const linkedUser = await adapter.getUserByAccount({
    provider: "github",
    providerAccountId: `${MARK}-gh`,
  });
  assert("getUserByAccount 能取回关联用户（Account 复合唯一键正确）", linkedUser?.id === created.id);

  // 同一个 provider+providerAccountId 再绑一次应违反唯一约束（说明索引生效）
  let duplicateRejected = false;
  try {
    await adapter.linkAccount({
      userId: created.id,
      type: "oauth",
      provider: "github",
      providerAccountId: `${MARK}-gh`,
    });
  } catch {
    duplicateRejected = true;
  }
  assert("重复绑定同一 GitHub 账号被唯一约束拒绝", duplicateRejected);

  await adapter.unlinkAccount({ provider: "github", providerAccountId: `${MARK}-gh` });
  const unlinked = await adapter.getUserByAccount({
    provider: "github",
    providerAccountId: `${MARK}-gh`,
  });
  assert("unlinkAccount 生效", unlinked === null);

  // ---------- 4. 数据库会话方法（当前用 JWT 策略，留着验证 schema 兼容） ----------
  const sessionToken = `${MARK}-session-token`;
  const expires = new Date(Date.now() + 60 * 60 * 1000);

  const session = await adapter.createSession({ sessionToken, userId: created.id, expires });
  assert("createSession 成功", session?.sessionToken === sessionToken);

  const pair = await adapter.getSessionAndUser(sessionToken);
  assert("getSessionAndUser 同时返回会话与用户", pair?.user?.id === created.id);
  assert("getSessionAndUser 返回的 session 正确", pair?.session?.sessionToken === sessionToken);

  const extended = await adapter.updateSession({
    sessionToken,
    expires: new Date(expires.getTime() + 1000),
  });
  assert("updateSession 能延长有效期", extended?.sessionToken === sessionToken);

  await adapter.deleteSession(sessionToken);
  const gone = await adapter.getSessionAndUser(sessionToken);
  assert("deleteSession 生效", gone === null);

  // ---------- 5. 验证令牌（未来接入邮箱 magic link 会用到） ----------
  const identifier = `${MARK}-verify@example.com`;
  await adapter.createVerificationToken({ identifier, token: `${MARK}-token`, expires });

  const consumed = await adapter.useVerificationToken({ identifier, token: `${MARK}-token` });
  assert("createVerificationToken / useVerificationToken 可用", consumed?.identifier === identifier);

  const reused = await adapter.useVerificationToken({ identifier, token: `${MARK}-token` });
  assert("令牌用过即失效（再取返回 null）", reused === null);

  // ---------- 6. 删除用户应级联清掉 Account ----------
  const deletingId = created.id;

  await adapter.deleteUser(deletingId);

  const leftoverAccounts = await prisma.account.count({ where: { userId: deletingId } });
  assert("deleteUser 级联删除 Account 记录", leftoverAccounts === 0);

  console.log(failures === 0 ? "RESULT_OK" : `RESULT_FAIL ${failures} 项断言失败`);
} catch (error) {
  console.error(`RESULT_FAIL ${error.message}`);
  failures += 1;
} finally {
  // 兜底清理：按前缀扫，避免中途失败留下垃圾
  try {
    await prisma.user.deleteMany({ where: { email: { startsWith: MARK } } });
    await prisma.verificationToken.deleteMany({ where: { identifier: { startsWith: MARK } } });
    const leftover = await prisma.user.count({ where: { email: { startsWith: MARK } } });
    console.log(`CLEANUP leftover_users=${leftover}`);
  } catch (error) {
    console.log(`CLEANUP_SKIPPED（数据库不可写或连接失败）`);
    console.log(`  ${error.message.split("\n").pop()}`);
  }

  await prisma.$disconnect();
  process.exitCode = failures === 0 ? 0 : 1;
}
