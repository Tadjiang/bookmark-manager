"use server";

// 登录 / 登出 / 注册的 Server Action。
//
// 为什么要包一层而不是直接在表单里调 signIn：
// 1. 需要把 Auth.js 抛出的错误（凭据错误、OAuth 配置缺失等）转成可展示的文案；
// 2. 需要区分 AuthError 与 Next.js 的 redirect 控制流——redirect 是靠抛异常实现的，
//    必须原样 rethrow，否则"登录成功"会被 catch 吞掉并显示成错误。

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn, signOut } from "@/auth";
import { hashPassword } from "@/lib/password";
import { getPrisma } from "@/lib/prisma";
import { isRedirectError } from "@/lib/redirect-error";
import { safeCallbackUrl } from "@/lib/safe-redirect";

export type AuthFormState = { error?: string } | undefined;

function readCredentials(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  return { email, password };
}

// Auth.js 的凭据错误统一是 CredentialsSignin；刻意不区分"用户不存在"和"密码错误"，
// 避免账号枚举。
function toMessage(error: unknown): string {
  if (error instanceof AuthError) {
    return error.type === "CredentialsSignin"
      ? "邮箱或密码不正确"
      : "登录失败，请稍后重试";
  }

  return "登录失败，请稍后重试";
}

export async function authenticateWithCredentials(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const { email, password } = readCredentials(formData);
  // 只在站内跳转：表单里这个字段来自 ?callbackUrl=，是不可信输入。
  const redirectTo = safeCallbackUrl(formData.get("callbackUrl"));

  if (!email || !password) {
    return { error: "请填写邮箱和密码" };
  }

  try {
    await signIn("credentials", { email, password, redirectTo });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    return { error: toMessage(error) };
  }

  return undefined;
}

export async function authenticateWithGitHub(formData: FormData): Promise<void> {
  const redirectTo = safeCallbackUrl(formData.get("callbackUrl"));

  await signIn("github", { redirectTo });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

export async function registerWithCredentials(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const { email, password } = readCredentials(formData);
  const name = String(formData.get("name") ?? "").trim();
  const confirm = String(formData.get("confirmPassword") ?? "");

  // 先做本地校验：省一次数据库往返，也能给出更具体的提示。
  if (!email || !password) {
    return { error: "请填写邮箱和密码" };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "邮箱格式不正确" };
  }

  if (password.length < 8) {
    return { error: "密码至少 8 位" };
  }

  if (password !== confirm) {
    return { error: "两次输入的密码不一致" };
  }

  const prisma = getPrisma();

  try {
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      return { error: "该邮箱已注册，请直接登录" };
    }

    await prisma.user.create({
      data: {
        email,
        name: name || email.split("@")[0],
        // 只有邮箱注册的用户才有 passwordHash；OAuth 用户这个字段为 null。
        passwordHash: await hashPassword(password),
      },
    });
  } catch (error) {
    console.error("注册失败", error);

    return { error: "注册失败，请稍后重试" };
  }

  // 注册成功后直接登录，省掉一次手动输入。
  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    // 账号已经建好了，自动登录失败就让用户自己去登录页。
    redirect("/signin?registered=1");
  }

  return undefined;
}
