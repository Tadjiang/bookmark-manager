import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SignOutButton } from "@/app/auth-forms";
import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "我的书签 - 书签管理器",
};

// 注意不要写 `export const dynamic = "force-dynamic"`：next.config.ts 开了 cacheComponents，
// Next 16 已移除 dynamic/revalidate/fetchCache 这类段配置，写了会直接编译失败（整条路由 500）。
//
// cacheComponents 下正确的写法是"静态外壳 + 把请求期数据下沉到 <Suspense>"：
// auth() 读会话 cookie、Prisma 查询都是请求期行为，放在页面顶层会让预渲染失败
// （见 node_modules/next/dist/docs 里的 authentication-with-cache-components 指南）。
export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  const session = await auth();

  // proxy 已经拦过一次；这里再判一次是为了类型收窄
  // （session.user.id 只在登录后存在），也防止 proxy 配置被改动后漏掉保护。
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      image: true,
      passwordHash: true,
      createdAt: true,
      _count: { select: { bookmarks: true, tags: true } },
    },
  });

  if (!user) {
    // 会话有效但用户已被删除的边界情况。
    redirect("/signin");
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
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
            <p className="text-sm text-black/60 dark:text-white/60">{user.email}</p>
          </div>
        </div>

        <SignOutButton />
      </header>

      <section className="rounded-xl border border-black/[.08] p-5 dark:border-white/[.12]">
        <h2 className="font-medium">账号状态</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-black/60 dark:text-white/60">登录方式</dt>
            <dd>{user.passwordHash ? "邮箱密码" : "GitHub OAuth"}</dd>
          </div>
          <div>
            <dt className="text-black/60 dark:text-white/60">注册时间</dt>
            <dd>{user.createdAt.toLocaleString("zh-CN")}</dd>
          </div>
          <div>
            <dt className="text-black/60 dark:text-white/60">书签数</dt>
            <dd>{user._count.bookmarks}</dd>
          </div>
          <div>
            <dt className="text-black/60 dark:text-white/60">标签数</dt>
            <dd>{user._count.tags}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-dashed border-black/[.12] p-5 text-sm text-black/60 dark:border-white/[.18] dark:text-white/60">
        <h2 className="font-medium text-black dark:text-white">书签列表（Day 4）</h2>
        <p className="mt-2">
          增删改查与搜索将在 Day 4 接入这里。当前页面已经验证了受保护路由与登录态能
          正常工作。
        </p>
      </section>

      <p className="text-sm">
        <Link href="/" className="text-black/60 underline dark:text-white/60">
          返回首页
        </Link>
      </p>
    </main>
  );
}

// 流式渲染时的占位：块级骨架与真实布局同构，避免内容替换时跳动。
function DashboardSkeleton() {
  const block = "rounded bg-black/[.06] dark:bg-white/[.08]";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-full ${block}`} />
          <div className="flex flex-col gap-2">
            <div className={`h-4 w-28 ${block}`} />
            <div className={`h-3 w-40 ${block}`} />
          </div>
        </div>
        <div className={`h-8 w-20 rounded-lg ${block}`} />
      </header>

      <section className="rounded-xl border border-black/[.08] p-5 dark:border-white/[.12]">
        <div className={`h-4 w-20 ${block}`} />
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="flex flex-col gap-2">
              <div className={`h-3 w-16 ${block}`} />
              <div className={`h-4 w-24 ${block}`} />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-dashed border-black/[.12] p-5 dark:border-white/[.18]">
        <div className={`h-4 w-32 ${block}`} />
        <div className={`mt-3 h-3 w-full ${block}`} />
      </section>

      <p className="text-sm text-black/40 dark:text-white/40">正在读取账号信息…</p>
    </main>
  );
}
