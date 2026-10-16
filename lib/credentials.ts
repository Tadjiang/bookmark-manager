// 邮箱+密码的校验逻辑。
//
// 单独放在这里而不是内联在 auth.ts 的 authorize 里，是为了能脱离 HTTP 直接测试：
// 这段逻辑（查用户 → 校验密码 → 归一化邮箱）是登录流程里最容易出错、也最该被
// 反复验证的部分，而完整的登录链路需要跑起 dev server 才能验。
//
// 注意：本模块不 import auth.ts，避免循环依赖。

import { verifyPassword } from "@/lib/password";
import { getPrisma } from "@/lib/prisma";

export type AuthenticatedUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
};

export function normalizeEmail(input: unknown): string {
  return String(input ?? "")
    .trim()
    .toLowerCase();
}

/**
 * 校验邮箱+密码。
 *
 * - 邮箱统一转小写再查库，和注册时写入的格式保持一致；
 * - 用户不存在、或该用户是纯 OAuth 用户（没有 passwordHash）时返回 null；
 * - 密码错误返回 null。
 *
 * 三种情况都返回 null、且不抛错，是为了让调用方（authorize）无法区分它们，
 * 从而避免通过错误信息枚举出哪些邮箱已经注册。
 */
export async function verifyCredentials(
  rawEmail: unknown,
  rawPassword: unknown,
): Promise<AuthenticatedUser | null> {
  const email = normalizeEmail(rawEmail);
  const password = String(rawPassword ?? "");

  if (!email || !password) {
    return null;
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user?.passwordHash) {
    return null;
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    return null;
  }

  return { id: user.id, name: user.name, email: user.email, image: user.image };
}
