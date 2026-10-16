// 单条书签的展示。服务端组件：不参与交互，也就不需要发到客户端。
// 交互部分（编辑/删除）交给 BookmarkItemActions 这个客户端组件。

import Link from "next/link";

import { BookmarkItemActions } from "@/app/dashboard/bookmark-item-actions";
import { cardClass } from "@/app/dashboard/form-ui";
import { displayHostname } from "@/lib/bookmark-input";
import type { BookmarkWithTags } from "@/lib/bookmarks";

/** 点标签时保留当前的关键词，两者才是"叠加筛选"而不是互相覆盖。 */
function tagHref(name: string, q: string): string {
  const params = new URLSearchParams();

  if (q) {
    params.set("q", q);
  }

  params.set("tag", name);

  return `/dashboard?${params.toString()}`;
}

export function BookmarkItem({ bookmark, q = "" }: { bookmark: BookmarkWithTags; q?: string }) {
  return (
    <li className={cardClass}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <a
          href={bookmark.url}
          target="_blank"
          // noopener 挡 window.opener 劫持；noreferrer 连 Referer 一起挡掉。
          rel="noopener noreferrer"
          className="font-medium break-all underline-offset-2 hover:underline"
        >
          {bookmark.title}
        </a>
        <span className="text-xs text-black/50 dark:text-white/50">
          {displayHostname(bookmark.url)}
        </span>
      </div>

      {bookmark.description ? (
        <p className="mt-2 text-sm whitespace-pre-line text-black/70 dark:text-white/70">
          {bookmark.description}
        </p>
      ) : null}

      {bookmark.tags.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {bookmark.tags.map((tag) => (
            <li key={tag.name}>
              <Link
                href={tagHref(tag.name, q)}
                className="inline-block rounded-full bg-black/[.05] px-2 py-0.5 text-xs transition hover:bg-black/[.1] dark:bg-white/[.08] dark:hover:bg-white/[.14]"
              >
                {tag.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-2 text-xs text-black/40 dark:text-white/40">
        创建于 {bookmark.createdAt.toLocaleString("zh-CN")}
      </p>

      <BookmarkItemActions
        bookmark={{
          id: bookmark.id,
          url: bookmark.url,
          title: bookmark.title,
          description: bookmark.description,
          tags: bookmark.tags,
        }}
      />
    </li>
  );
}
