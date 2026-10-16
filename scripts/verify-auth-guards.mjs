// 安全护栏探针：只测纯函数与静态约束，不碰数据库、不需要 dev server，
// 因此在受限环境里也能跑（用来确认这些护栏没有被后续改动悄悄破坏）。
//
// 用法：
//   node scripts/verify-auth-guards.mjs
//
// 覆盖：
//   - safeCallbackUrl：open redirect 的各种绕过写法必须被拦下
//   - normalizeEmail：注册与登录必须共用同一套归一化规则
//   - 静态检查：middleware 的 matcher、auth-forms 是否带上 callbackUrl 隐藏字段

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { register } from "node:module";

register("./prisma-esm-hook.mjs", import.meta.url);

const { safeCallbackUrl, DEFAULT_AUTH_REDIRECT } = await import("../lib/safe-redirect.ts");
const { normalizeEmail } = await import("../lib/credentials.ts");

let failures = 0;

function assert(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}`);

  if (!condition) {
    failures += 1;
  }
}

// ---------- 1. open redirect：这些都必须是"拒绝" ----------
const rejected = [
  ["绝对地址 https://evil.example.com", "https://evil.example.com"],
  ["协议相对地址 //evil.example.com", "//evil.example.com"],
  ["反斜杠变体 /\\evil.example.com", "/\\evil.example.com"],
  ["嵌套反斜杠 /a\\b", "/a\\b"],
  ["javascript: 伪协议", "javascript:alert(1)"],
  ["无前导斜杠 dashboard", "dashboard"],
  ["空字符串", ""],
  ["只有空格", "   "],
  ["非字符串对象", { toString: () => "/dashboard" }],
  ["undefined", undefined],
  ["null", null],
  ["带 CRLF 的注入尝试", "/dashboard\r\nSet-Cookie: a=b"],
  ["带 NUL 的注入尝试", "/dash\u0000board"],
];

for (const [label, value] of rejected) {
  const result = safeCallbackUrl(value);
  assert(`拒绝 ${label} → 回落 ${DEFAULT_AUTH_REDIRECT}`, result === DEFAULT_AUTH_REDIRECT);
}

// ---------- 2. 合法站内路径：必须保留 ----------
const accepted = [
  ["/dashboard", "/dashboard"],
  ["带查询串 /dashboard?tab=all", "/dashboard?tab=all"],
  ["带锚点 /dashboard#top", "/dashboard#top"],
  ["带前导空格（应 trim 后保留）", "  /dashboard  "],
  ["中文路径 /我的书签", "/我的书签"],
];

for (const [label, value] of accepted) {
  const expected = value.trim();
  assert(`保留 ${label}`, safeCallbackUrl(value) === expected);
}

// ---------- 3. normalizeEmail 与 safeCallbackUrl 的边界一致性 ----------
assert("normalizeEmail 去空白转小写", normalizeEmail("  A@B.COM ") === "a@b.com");
assert("normalizeEmail 容忍 undefined", normalizeEmail(undefined) === "");
assert("normalizeEmail 容忍数字", normalizeEmail(123) === "123");

// ---------- 4. 静态约束 ----------
function read(relativePath) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

// Next.js 16 把 middleware 改名为 proxy（middleware.ts 已弃用）
assert("旧的 middleware.ts 已不存在", !existsSync(resolve(process.cwd(), "middleware.ts")));

const proxy = read("proxy.ts");
assert("proxy 只匹配 /dashboard", proxy.includes('"/dashboard/:path*"'));
assert("proxy 跳转到 /signin", proxy.includes('"/signin"'));
assert("proxy 带上 callbackUrl", proxy.includes("callbackUrl"));
assert("proxy 用 auth 包装（保证 req.auth 可用）", proxy.includes("auth("));

const forms = read("app/auth-forms.tsx");
const callbackFieldCount = (forms.match(/name="callbackUrl"/g) ?? []).length;
assert("登录与 GitHub 表单都带上 callbackUrl 隐藏字段（应为 2 处）", callbackFieldCount === 2);

const actions = read("app/actions/auth.ts");
assert("登录 action 使用 safeCallbackUrl", actions.includes("safeCallbackUrl"));

// ---------- 5. 会话字段白名单：密码哈希不能进 JWT ----------
const { toSessionUser } = await import("../auth.ts");

// 模拟 PrismaAdapter 真实返回的行：带上了我们自己的扩展列
const adapterRow = {
  id: "clx0000000000000000000000",
  name: "张三",
  email: "zhangsan@example.com",
  emailVerified: new Date(),
  image: "https://avatars.example.com/u/1.png",
  passwordHash: "scrypt$32768$8$1$c2FsdA==$aGFzaA==",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const sessionUser = toSessionUser(adapterRow);
const serialized = JSON.stringify(sessionUser);

assert("白名单保留了 id", sessionUser.id === adapterRow.id);
assert("白名单保留了 email", sessionUser.email === adapterRow.email);
assert("白名单保留了 name", sessionUser.name === adapterRow.name);
assert("白名单保留了 picture（来自 image）", sessionUser.picture === adapterRow.image);
assert("passwordHash 不在会话用户里", !("passwordHash" in sessionUser));
assert("emailVerified 不在会话用户里", !("emailVerified" in sessionUser));
assert("createdAt / updatedAt 不在会话用户里", !("createdAt" in sessionUser) && !("updatedAt" in sessionUser));
assert("序列化后也搜不到密码哈希", !serialized.includes("scrypt$"));
assert("字段数量正好是 4 个", Object.keys(sessionUser).length === 4);

// 顺带确认 auth.ts 里没有把整对象塞进 token 的写法（防止以后改动回退）
const authSource = read("auth.ts");
assert(
  "jwt 回调没有整对象赋值（token.user = user / ...user）",
  !/token\.user\s*=/.test(authSource) && !/\.\.\.user/.test(authSource),
);

// ---------- 6. 认证错误码 → 可读文案 ----------
const { authErrorMessage } = await import("../lib/auth-errors.ts");

assert("没有 error 参数时不显示错误", authErrorMessage(undefined) === undefined);
assert("空字符串不显示错误", authErrorMessage("") === undefined);
assert("非字符串不显示错误", authErrorMessage(123) === undefined);

const notLinked = authErrorMessage("OAuthAccountNotLinked");
assert("OAuthAccountNotLinked 有专门文案", typeof notLinked === "string" && notLinked.includes("邮箱密码"));
assert("AccessDenied 有专门文案", (authErrorMessage("AccessDenied") ?? "").includes("拒绝"));
assert("Configuration 有专门文案", (authErrorMessage("Configuration") ?? "").includes("AUTH_"));

const unknown = authErrorMessage("SomeBrandNewErrorCode");
assert(
  "未知错误码给出兜底文案、不直接暴露类名",
  typeof unknown === "string" && !unknown.includes("SomeBrandNewErrorCode"),
);

// 覆盖到的错误码数量（防止以后误删映射）
const errorsSource = read("lib/auth-errors.ts");
const mappedCodes = (errorsSource.match(/^\s{2}[A-Z][A-Za-z]+:/gm) ?? []).length;
assert(`错误码映射数量合理（当前 ${mappedCodes} 个，≥10）`, mappedCodes >= 10);

// ---------- 7. 数据库连接串的路径解析（踩过的 bug：相对路径被当成绝对路径） ----------
const { toAbsoluteDatabaseUrl } = await import("./lib/db-url.mjs");

const cwd = process.cwd();
const normalizedCwd = cwd.replace(/\\/g, "/");

assert(
  "file:./dev.db 解析成绝对路径",
  toAbsoluteDatabaseUrl("file:./dev.db", cwd) === `file:${normalizedCwd}/dev.db`,
);
assert(
  "file:dev.db 解析成绝对路径",
  toAbsoluteDatabaseUrl("file:dev.db", cwd) === `file:${normalizedCwd}/dev.db`,
);
// 注意：resolve 会规范化路径，`../` 段会被折叠掉（这是期望行为）
const { dirname } = await import("node:path");
assert(
  "file:../other.db 解析成绝对路径并折叠 ..",
  toAbsoluteDatabaseUrl("file:../other.db", cwd) ===
    `file:${dirname(normalizedCwd).replace(/\\/g, "/")}/other.db`,
);
assert(
  "Windows 绝对路径保持不变",
  toAbsoluteDatabaseUrl("file:D:/x/dev.db", cwd) === "file:D:/x/dev.db",
);
assert("内存库保持不变", toAbsoluteDatabaseUrl("file::memory:", cwd) === "file::memory:");
assert(
  "远端 libsql:// 保持不变",
  toAbsoluteDatabaseUrl("libsql://xxx.turso.io", cwd) === "libsql://xxx.turso.io",
);
assert("带引号的值会去掉引号", toAbsoluteDatabaseUrl('"file:./dev.db"', cwd).startsWith("file:"));
assert(
  "回归：相对路径绝不能被当成绝对路径原样返回",
  toAbsoluteDatabaseUrl("file:./dev.db", cwd) !== "file:./dev.db",
);

console.log(failures === 0 ? "RESULT_OK" : `RESULT_FAIL ${failures} 项断言失败`);
process.exitCode = failures === 0 ? 0 : 1;
