// 书签列表：页面里唯一真正"读请求期数据"的部分（searchParams + 查库）。
//
// 它被 page.tsx 放进 <Suspense>，所以外壳可以静态预渲染，这块流式补上。
// 注意不要在这里或 page.tsx 里写 `export const dynamic = ...` —— cacheComponents
// 下这些段配置已被移除，写了整条路由编译失败（docs/ISSUES.md #7）。

import Link from "next/link";

import { BookmarkForm } from "@/app/dashboard/bookmark-form";
import { BookmarkItem } from "@/app/dashboard/bookmark-item";
import { SearchBar } from "@/app/dashboard/search-bar";
import { listBookmarks, listTags, MAX_BOOKMARKS } from "@/lib/bookmarks";

export type DashboardSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

/** URL 里的重复参数（?q=a&q=b）取第一个，避免把数组塞进查询条件。 */
function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return (value[0] ?? "").trim();
  }

  return (value ?? "").trim();
}

export async function BookmarkList({ searchParams }: { searchParams: DashboardSearchParams }) {
  const params = await searchParams;
  const q = firstValue(params.q);
  const tag = firstValue(params.tag);

  // listBookmarks 与 listTags 各自都会校验一次会话，这里并发发起省一次串行等待。
  const [{ items, truncated }, tags] = await Promise.all([
    listBookmarks({ q, tag }),
    listTags(),
  ]);

  const filtered = Boolean(q || tag);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-black/[.08] p-5 dark:border-white/[.12]">
        <h2 className="font-medium">添加书签</h2>
        <div className="mt-3">
          <BookmarkForm mode="create" />
        </div>
      </section>

      <SearchBar q={q} tag={tag} tags={tags} />

      {truncated ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          书签较多，仅显示最近 {MAX_BOOKMARKS} 条。
        </p>
      ) : null}

      {items.length === 0 ? (
        <EmptyState filtered={filtered} />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((bookmark) => (
            <BookmarkItem key={bookmark.id} bookmark={bookmark} q={q} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** 区分"一条都没有"和"筛选后没结果"：前者引导添加，后者给清除筛选的出口。 */
function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-black/[.12] p-6 text-center text-sm text-black/60 dark:border-white/[.18] dark:text-white/60">
      {filtered ? (
        <>
          <p>没有匹配的书签。</p>
          <Link href="/dashboard" scroll={false} className="mt-2 inline-block underline">
            清除筛选
          </Link>
        </>
      ) : (
        <p>还没有书签。用上面的表单保存第一条链接吧。</p>
      )}
    </div>
  );
}
