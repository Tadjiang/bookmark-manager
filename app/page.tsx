import { Suspense } from "react";

import Link from "next/link";

import { auth } from "@/auth";

// Next 16 的 cacheComponents 要求把"读请求期数据"的部分放进 <Suspense>：
// auth() 会读会话 cookie，放在页面顶层会导致预渲染（build）报
// "Next.js encountered uncached or runtime data during prerendering"。
// 所以这里让外层保持同步、可预渲染成静态外壳，把会话读取下沉到 SessionActions。
//
// 顺带说明：不要写 `export const dynamic = "force-dynamic"`——cacheComponents 下
// dynamic/revalidate/fetchCache 这类段配置已被移除，写了会直接编译失败。
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-8 px-6 py-20 text-center">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">书签管理器</h1>
        <p className="text-black/60 dark:text-white/60">
          快速保存、组织、搜索你的书签。
        </p>
      </div>

      <Suspense fallback={<SessionActionsFallback />}>
        <SessionActions />
      </Suspense>
    </main>
  );
}

async function SessionActions() {
  const session = await auth();

  if (session?.user) {
    return (
      <div className="flex w-full max-w-xs flex-col gap-3">
        <p className="text-sm text-black/60 dark:text-white/60">
          已登录为 {session.user.email}
        </p>
        <Link
          href="/dashboard"
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
        >
          进入我的书签
        </Link>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-xs flex-col gap-3">
      <Link
        href="/signin"
        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
      >
        登录
      </Link>
      <Link
        href="/register"
        className="rounded-lg border border-black/[.12] px-4 py-2 text-sm font-medium transition hover:bg-black/[.04] dark:border-white/[.18] dark:hover:bg-white/[.06]"
      >
        注册
      </Link>
    </div>
  );
}

// 占位块的高度/宽度尽量贴近真实内容，避免流式替换时页面跳动。
function SessionActionsFallback() {
  return (
    <div className="flex w-full max-w-xs flex-col gap-3" aria-hidden>
      <div className="h-[22px] rounded bg-black/[.06] dark:bg-white/[.08]" />
      <div className="h-9 rounded-lg bg-black/[.06] dark:bg-white/[.08]" />
    </div>
  );
}
