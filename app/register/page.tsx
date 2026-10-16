import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { RegisterForm } from "@/app/auth-forms";
import { auth } from "@/auth";

export const metadata: Metadata = {
  title: "注册 - 书签管理器",
};

// cacheComponents 下，读会话 cookie 的 auth() 必须放在 <Suspense> 后面，
// 否则 next build 预渲染会报 "uncached or runtime data during prerendering"。
// 外层保持同步 → 可预渲染成静态外壳。
export default function RegisterPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">注册</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          用邮箱和密码创建一个账号
        </p>
      </div>

      <Suspense fallback={<FormSkeleton />}>
        <RegisterContent />
      </Suspense>

      <p className="text-center text-sm">
        <Link href="/" className="text-black/60 underline dark:text-white/60">
          返回首页
        </Link>
      </p>
    </main>
  );
}

async function RegisterContent() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return <RegisterForm />;
}

// 与表单首屏高度接近的占位，避免流式替换时跳动。
function FormSkeleton() {
  const block = "rounded bg-black/[.06] dark:bg-white/[.08]";

  return (
    <div className="flex flex-col gap-4" aria-hidden>
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="flex flex-col gap-2">
          <div className={`h-4 w-20 ${block}`} />
          <div className={`h-9 w-full ${block}`} />
        </div>
      ))}
      <div className={`h-9 w-full ${block}`} />
    </div>
  );
}
