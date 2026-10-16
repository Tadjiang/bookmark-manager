import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";

import { getPrisma } from "@/lib/prisma";
import { verifyCredentials } from "@/lib/credentials";
import { githubAuthEnabled } from "@/lib/auth-config";

// GitHub OAuth 的凭据缺失时不要让整个模块炸掉：
// 只关掉这个 provider，本地仍能用邮箱+密码登录。
// 注意不能在这里 throw——`next build` 收集路由信息时会求值本模块的顶层代码，
// 构建机上通常没有这些变量，顶层抛错会让构建红灯（Day 2 已经踩过一次）。
const githubEnabled = githubAuthEnabled;

// PrismaAdapter 必须惰性创建。
//
// 不能写 `adapter: PrismaAdapter(getPrisma())`：那样模块被 import 的瞬间就会调用
// getPrisma()，而它在缺少 DATABASE_URL 时是 throw——`next build` 在"收集路由信息"
// 阶段会求值顶层代码，构建机上没有 .env，于是整个构建失败（与 Day 2 那次同一个坑）。
// 用 Proxy 把创建推迟到真正调用某个 adapter 方法时（即请求期）。
let cachedAdapter: Adapter | undefined;

const lazyAdapter = new Proxy({} as Adapter, {
  get(_target, property) {
    cachedAdapter ??= PrismaAdapter(getPrisma());
    const value = Reflect.get(cachedAdapter, property);

    // adapter 的方法都要绑定到真正的对象上，否则丢 this。
    return typeof value === "function" ? value.bind(cachedAdapter) : value;
  },
});

/**
 * 把认证用户压成"可以放进会话 cookie"的最小字段集合。
 *
 * 这是安全边界，不是顺手写的映射：PrismaAdapter 的 getUser / createUser 返回的是整行
 * User 数据，除了 name/email/image 还带着我们自己的扩展列——最要紧的是 passwordHash。
 * 如果把 user 原样塞进 token，密码哈希会被编码进 JWT 的明文 payload，并出现在
 * /api/auth/session 的响应里。所以这里用白名单，只挑该暴露的字段。
 *
 * 抽成独立函数是为了能单独测试（见 scripts/verify-auth-guards.mjs）。
 */
export function toSessionUser(input: unknown): {
  id: string;
  name: string | null;
  email: string | null;
  picture: string | null;
} {
  const raw = (input ?? {}) as Record<string, unknown>;

  return {
    id: typeof raw.id === "string" ? raw.id : String(raw.id ?? ""),
    name: typeof raw.name === "string" ? raw.name : null,
    email: typeof raw.email === "string" ? raw.email : null,
    picture: typeof raw.image === "string" ? raw.image : null,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // 认证相关的表（User / Account / Session / VerificationToken）Day 2 已按
  // Auth.js Prisma 适配器的约定建好，所以这里直接接上，不需要再产生迁移。
  adapter: lazyAdapter,

  // 有 Credentials provider 时必须用 JWT：Auth.js 不会为凭据登录创建数据库会话。
  // 两种登录方式共用同一套 JWT 会话，Session 表因此不会被使用（表保留，供以后切换）。
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },

  pages: {
    signIn: "/signin",
  },

  providers: [
    ...(githubEnabled ? [GitHub] : []),

    Credentials({
      // 用 ASCII 名称：这个值会出现在 /api/auth/providers 和默认登录页上，
      // 中文在部分终端/客户端里会显示成乱码。
      name: "Email & Password",
      credentials: {
        email: { label: "邮箱", type: "email", placeholder: "you@example.com" },
        password: { label: "密码", type: "password" },
      },
      // 校验逻辑抽在 lib/credentials.ts：既能脱离 HTTP 测试，
      // 也保证注册与登录对邮箱的归一化规则一致。
      async authorize(credentials) {
        return verifyCredentials(credentials?.email, credentials?.password);
      },
    }),
  ],

  callbacks: {
    // JWT 策略下，session 的内容由这里决定，所以这里也是"什么能进 cookie"的唯一闸门。
    // 字段白名单见 toSessionUser 的注释。
    jwt({ token, user }) {
      if (user) {
        const safe = toSessionUser(user);

        token.id = safe.id;
        token.name = safe.name;
        token.email = safe.email;
        token.picture = safe.picture;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? "");
        session.user.name = typeof token.name === "string" ? token.name : null;
        session.user.email = typeof token.email === "string" ? token.email : "";
        session.user.image = typeof token.picture === "string" ? token.picture : null;
      }

      return session;
    },
  },
});
