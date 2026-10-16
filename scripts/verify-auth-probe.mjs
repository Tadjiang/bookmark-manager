// Day 3 验证探针：邮箱+密码登录链路（注册 → 校验登录）。
//
// 覆盖 lib/credentials.ts 的全部分支，并真实读写 dev.db：
//   - 邮箱大小写/空白归一化（注册写小写，登录容忍各种写法）
//   - 正确密码通过
//   - 错误密码 / 不存在的用户 / 纯 OAuth 用户（passwordHash 为 null）/ 空输入 一律返回 null
//   - 密码不会以明文落库
//
// 用法（先停掉 dev server，SQLite 是文件锁）：
//   node scripts/verify-auth-probe.mjs
//
// 结束时打印 RESULT_OK 或 RESULT_FAIL + 原因；正常跑完不留任何测试数据。

import { register } from "node:module";

import { PrismaLibSql } from "@prisma/adapter-libsql";

import { resolveDatabaseUrl } from "./lib/db-url.mjs";

register("./prisma-esm-hook.mjs", import.meta.url);

const { PrismaClient } = await import("../app/generated/prisma/client.ts");

const url = resolveDatabaseUrl();
const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });

// 探针直接复用应用代码里的校验函数（同一个模块，不是复制一份逻辑）
const { verifyCredentials, normalizeEmail } = await import("../lib/credentials.ts");
const { hashPassword } = await import("../lib/password.ts");

const MARK = `authprobe-${Date.now()}`;
const email = `${MARK}@example.com`;
const password = "correct horse battery staple";

let createdId;

function assert(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}`);

  if (!condition) {
    throw new Error(`断言失败：${label}`);
  }
}

try {
  console.log(`DATABASE_URL=${url}`);

  // ---------- 0. 纯函数：邮箱归一化 ----------
  assert("normalizeEmail 去空白并转小写", normalizeEmail("  Foo@Example.COM ") === "foo@example.com");
  assert("normalizeEmail 容忍 undefined", normalizeEmail(undefined) === "");

  // ---------- 1. 注册：写入 passwordHash ----------
  const created = await prisma.user.create({
    data: { email, name: "auth probe", passwordHash: await hashPassword(password) },
  });
  createdId = created.id;
  console.log(`REGISTER_OK id=${created.id}`);

  const stored = await prisma.user.findUnique({ where: { id: created.id } });
  assert("passwordHash 已落库且非明文", Boolean(stored.passwordHash) && !stored.passwordHash.includes(password));
  assert("passwordHash 是 scrypt 格式", stored.passwordHash.startsWith("scrypt$"));

  // ---------- 2. 正确密码：各种邮箱写法都要能登录 ----------
  for (const variant of [email, email.toUpperCase(), `  ${email}  `]) {
    const user = await verifyCredentials(variant, password);
    assert(`正确密码 + 邮箱写法 ${JSON.stringify(variant).slice(0, 24)}… 可登录`, user?.id === created.id);
  }

  // ---------- 3. 失败分支 ----------
  assert("错误密码被拒", (await verifyCredentials(email, "wrong password")) === null);
  assert("不存在的用户被拒", (await verifyCredentials(`${MARK}-nobody@example.com`, password)) === null);
  assert("空密码被拒", (await verifyCredentials(email, "")) === null);
  assert("空邮箱被拒", (await verifyCredentials("", password)) === null);
  assert("undefined 入参被拒", (await verifyCredentials(undefined, undefined)) === null);

  // ---------- 4. 纯 OAuth 用户（passwordHash 为 null）不能靠密码登录 ----------
  const oauthOnly = await prisma.user.create({
    data: { email: `${MARK}-oauth@example.com`, name: "oauth only" },
  });
  assert("无 passwordHash 的用户被拒", (await verifyCredentials(oauthOnly.email, password)) === null);
  assert("无 passwordHash 的用户用任意密码都被拒", (await verifyCredentials(oauthOnly.email, "anything")) === null);
  await prisma.user.delete({ where: { id: oauthOnly.id } });

  // ---------- 5. 清理 ----------
  await prisma.user.delete({ where: { id: created.id } });
  createdId = undefined;
  const leftover = await prisma.user.count({ where: { email: { startsWith: MARK } } });
  assert("测试数据已清理干净", leftover === 0);

  console.log("RESULT_OK");
} catch (error) {
  console.error(`RESULT_FAIL ${error.message}`);

  if (createdId) {
    try {
      await prisma.user.delete({ where: { id: createdId } });
      console.error("CLEANUP_OK 已回滚本次创建的测试数据");
    } catch (cleanupError) {
      console.error(`CLEANUP_FAIL ${cleanupError.message}（请手动删掉 ${MARK} 开头的数据）`);
    }
  }

  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
