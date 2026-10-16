"use client";

// 登录/注册表单要用 useActionState 拿到服务端返回的错误文案，所以是客户端组件。
// 实际的身份校验仍然在 Server Action 里完成。

import Link from "next/link";
import { useActionState } from "react";

import {
  authenticateWithCredentials,
  authenticateWithGitHub,
  registerWithCredentials,
  signOutAction,
  type AuthFormState,
} from "@/app/actions/auth";

const inputClass =
  "w-full rounded-lg border border-black/[.12] bg-white px-3 py-2 text-sm outline-none transition focus:border-black/40 dark:border-white/[.18] dark:bg-black dark:focus:border-white/50";

const labelClass = "mb-1 block text-sm font-medium";

function SubmitButton({ pending, children }: { pending: boolean; children: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-white/80"
    >
      {pending ? "处理中…" : children}
    </button>
  );
}

function ErrorText({ error }: { error?: string }) {
  if (!error) {
    return null;
  }

  return (
    <p
      role="alert"
      className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300"
    >
      {error}
    </p>
  );
}

export function SignInForm({
  githubEnabled,
  callbackUrl,
}: {
  githubEnabled: boolean;
  callbackUrl: string;
}) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    authenticateWithCredentials,
    undefined,
  );

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-3">
        {/* 保留 middleware 带过来的原地址；服务端会用 safeCallbackUrl 再净化一次 */}
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <div>
          <label className={labelClass} htmlFor="email">
            邮箱
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="password">
            密码
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
          />
        </div>

        <ErrorText error={state?.error} />

        <SubmitButton pending={pending}>登录</SubmitButton>
      </form>

      {githubEnabled ? (
        <>
          <div className="flex items-center gap-3 text-xs text-black/40 dark:text-white/40">
            <span className="h-px flex-1 bg-black/[.12] dark:bg-white/[.18]" />
            或
            <span className="h-px flex-1 bg-black/[.12] dark:bg-white/[.18]" />
          </div>

          <form action={authenticateWithGitHub}>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <button
              type="submit"
              className="w-full rounded-lg border border-black/[.12] px-4 py-2 text-sm font-medium transition hover:bg-black/[.04] dark:border-white/[.18] dark:hover:bg-white/[.06]"
            >
              使用 GitHub 登录
            </button>
          </form>
        </>
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          GitHub 登录未启用：请在 <code>.env</code> 里配置 <code>AUTH_GITHUB_ID</code> 与{" "}
          <code>AUTH_GITHUB_SECRET</code>（见 <code>.env.example</code>），然后重启 dev server。
        </p>
      )}

      <p className="text-center text-sm text-black/60 dark:text-white/60">
        还没有账号？{" "}
        <Link href="/register" className="font-medium underline">
          注册
        </Link>
      </p>
    </div>
  );
}

export function RegisterForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    registerWithCredentials,
    undefined,
  );

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-3">
        <div>
          <label className={labelClass} htmlFor="name">
            昵称（可选）
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="nickname"
            placeholder="怎么称呼你"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="email">
            邮箱
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="password">
            密码
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-black/50 dark:text-white/50">至少 8 位</p>
        </div>

        <div>
          <label className={labelClass} htmlFor="confirmPassword">
            确认密码
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className={inputClass}
          />
        </div>

        <ErrorText error={state?.error} />

        <SubmitButton pending={pending}>注册并登录</SubmitButton>
      </form>

      <p className="text-center text-sm text-black/60 dark:text-white/60">
        已经有账号了？{" "}
        <Link href="/signin" className="font-medium underline">
          去登录
        </Link>
      </p>
    </div>
  );
}

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="rounded-lg border border-black/[.12] px-3 py-1.5 text-sm transition hover:bg-black/[.04] dark:border-white/[.18] dark:hover:bg-white/[.06]"
      >
        退出登录
      </button>
    </form>
  );
}
