import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SignInForm } from "@/app/auth-forms";
import { auth } from "@/auth";
import { githubAuthEnabled } from "@/lib/auth-config";
import { authErrorMessage } from "@/lib/auth-errors";
import { safeCallbackUrl } from "@/lib/safe-redirect";

export const metadata: Metadata = {
  title: "登录 - 书签管理器",
};

type SignInSearchParams = {
  registered?: string;
  callbackUrl?: string;
  error?: string;
};

// cacheComponents 下，auth()（读会话 cookie）与 searchParams 都属于请求期数据，
// 必须放在 <Suspense> 后面，否则 next build 预渲染会报
// "uncached or runtime data during prerendering"。
//
// 注意：这里只是把 searchParams（一个 Promise）往下传，并不 await——
// 创建 Promise 不算读取请求期数据，真正的 await 发生在 Suspense 内部。
// 外层保持同步 → 可预渲染成静态外壳。
export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SignInSearchParams>;
}) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">登录</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          登录后即可保存和整理你的书签
        </p>
      </div>

      <Suspense fallback={<FormSkeleton />}>
        <SignInContent searchParams={searchParams} />
      </Suspense>

      <p className="text-center text-sm">
        <Link href="/" className="text-black/60 underline dark:text-white/60">
          返回首页
        </Link>
      </p>
    </main>
  );
}

async function SignInContent({
  searchParams,
}: {
  searchParams: Promise<SignInSearchParams>;
}) {
  // 已登录用户直接进 dashboard，避免重复登录。
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  const { registered, callbackUrl, error } = await searchParams;
  // 来自 URL 的不可信输入，先净化再传给表单（服务端 action 里还会再净化一次）。
  const safeRedirect = safeCallbackUrl(callbackUrl);
  // Auth.js 失败回跳时会带 ?error=，这里翻译成人话
  // （否则用户只会看到 OAuthAccountNotLinked 这种类名）。
  const errorMessage = authErrorMessage(error);

  return (
    <div className="flex flex-col gap-4">
      {registered ? (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-300">
          注册成功，请使用刚才的邮箱和密码登录。
        </p>
      ) : null}

      {errorMessage ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300"
        >
          {errorMessage}
        </p>
      ) : null}

      <SignInForm githubEnabled={githubAuthEnabled} callbackUrl={safeRedirect} />
    </div>
  );
}

// 与表单首屏高度接近的占位，避免流式替换时跳动。
function FormSkeleton() {
  const block = "rounded bg-black/[.06] dark:bg-white/[.08]";

  return (
    <div className="flex flex-col gap-4" aria-hidden>
      {[0, 1].map((index) => (
        <div key={index} className="flex flex-col gap-2">
          <div className={`h-4 w-20 ${block}`} />
          <div className={`h-9 w-full ${block}`} />
        </div>
      ))}
      <div className={`h-9 w-full ${block}`} />
    </div>
  );
}
