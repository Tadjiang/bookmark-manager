import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SignOutButton } from "@/app/auth-forms";
import {
  BookmarkList,
  type DashboardSearchParams,
} from "@/app/dashboard/bookmark-list";
import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "我的书签 - 书签管理器",
};

// 注意不要写 `export const dynamic = "force-dynamic"`：next.config.ts 开了 cacheComponents，
// Next 16 已移除 dynamic/revalidate/fetchCache 这类段配置，写了会直接编译失败（整条路由 500）。
//
// cacheComponents 下正确的写法是"静态外壳 + 把请求期数据下沉到 <Suspense>"：
// auth() 读会话 cookie、searchParams、Prisma 查询都是请求期行为，放在页面顶层会让预渲染失败
// （见 node_modules/next/dist/docs 里的 authentication-with-cache-components 指南）。
//
// searchParams 在这里**只传递不 await**（当作 Promise 往下传），await 发生在 Suspense 内部。
export default function DashboardPage({ searchParams }: { searchParams: DashboardSearchParams }) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent searchParams={searchParams} />
    </Suspense>
  );
}

async function DashboardContent({ searchParams }: { searchParams: DashboardSearchParams }) {
  const session = await auth();

  // proxy 已经拦过一次；这里再判一次是为了类型收窄
  // （session.user.id 只在登录后存在），也防止 proxy 配置被改动后漏掉保护。
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const user = await getPrisma().user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      image: true,
      _count: { select: { bookmarks: true } },
    },
  });

  if (!user) {
    // 会话有效但用户已被删除的边界情况。
    redirect("/signin");
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {user.image ? (
            <Image
              src={user.image}
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 rounded-full"
            />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/[.06] text-sm font-medium dark:bg-white/[.08]">
              {(user.name ?? user.email).slice(0, 1).toUpperCase()}
            </span>
          )}
          <div>
            <p className="font-medium">{user.name ?? "未命名用户"}</p>
            <p className="text-sm text-black/60 dark:text-white/60">
              {user.email} · 共 {user._count.bookmarks} 条书签
            </p>
          </div>
        </div>

        <SignOutButton />
      </header>

      {/* 列表才是真正读请求期数据（searchParams + 查库）的部分，单独再套一层 Suspense：
          账号信息先出来，列表随后流式补上，不必整页等到查库结束。 */}
      <Suspense fallback={<BookmarkListSkeleton />}>
        <BookmarkList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// 流式渲染时的占位：块级骨架与真实布局同构，避免内容替换时跳动。
function DashboardSkeleton() {
  const block = "rounded bg-black/[.06] dark:bg-white/[.08]";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-full ${block}`} />
          <div className="flex flex-col gap-2">
            <div className={`h-4 w-28 ${block}`} />
            <div className={`h-3 w-44 ${block}`} />
          </div>
        </div>
        <div className={`h-8 w-20 rounded-lg ${block}`} />
      </header>

      <BookmarkListSkeleton />

      <p className="text-sm text-black/40 dark:text-white/40">正在读取账号信息…</p>
    </main>
  );
}

/** 表单 + 搜索栏 + 若干卡片，与 BookmarkList 的实际布局同构。 */
function BookmarkListSkeleton() {
  const block = "rounded bg-black/[.06] dark:bg-white/[.08]";

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-black/[.08] p-5 dark:border-white/[.12]">
        <div className={`h-4 w-20 ${block}`} />
        <div className="mt-4 flex flex-col gap-3">
          <div className={`h-9 w-full ${block}`} />
          <div className={`h-9 w-full ${block}`} />
          <div className={`h-16 w-full ${block}`} />
        </div>
      </section>

      <div className={`h-9 w-full ${block}`} />

      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="rounded-xl border border-black/[.08] p-4 dark:border-white/[.12]"
          >
            <div className={`h-4 w-2/3 ${block}`} />
            <div className={`mt-3 h-3 w-full ${block}`} />
            <div className={`mt-2 h-3 w-1/2 ${block}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
