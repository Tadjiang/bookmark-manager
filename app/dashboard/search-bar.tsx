"use client";

// 搜索框与标签筛选。
//
// 唯一有技术含量的地方是防抖：输入每变一个字符就改 URL 会让每次按键都触发一次
// 服务端查询。这里停顿 300ms 再 router.replace，并且用 scroll: false 避免
// 每次查询都把页面滚回顶部。

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { inputClass } from "@/app/dashboard/form-ui";

const DEBOUNCE_MS = 300;

function chipClass(active: boolean): string {
  const base =
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition";

  return active
    ? `${base} bg-black text-white dark:bg-white dark:text-black`
    : `${base} bg-black/[.05] hover:bg-black/[.1] dark:bg-white/[.08] dark:hover:bg-white/[.14]`;
}

/** 只保留 q / tag 两个参数，两个都空时返回不带问号的路径。 */
function buildHref(pathname: string, q: string, tag: string): string {
  const params = new URLSearchParams();

  if (q) {
    params.set("q", q);
  }

  if (tag) {
    params.set("tag", tag);
  }

  const query = params.toString();

  return query ? `${pathname}?${query}` : pathname;
}

export function SearchBar({
  q,
  tag,
  tags,
}: {
  q: string;
  tag: string;
  tags: { name: string; count: number }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [value, setValue] = useState(q);
  const [pending, startTransition] = useTransition();

  // 记录"最后一次由本组件写进 URL 的关键词"，用来区分两种情况：
  // 用户打字（需要防抖后写 URL）与外部改了 URL（需要把输入框同步过来，
  // 比如点「清除筛选」或浏览器后退）。不区分的话，清空筛选会被输入框的旧值顶回去。
  const pushedRef = useRef(q);

  useEffect(() => {
    if (q !== pushedRef.current) {
      pushedRef.current = q;
      setValue(q);
    }
  }, [q]);

  useEffect(() => {
    if (value === q) {
      return;
    }

    const timer = setTimeout(() => {
      const next = value.trim();
      pushedRef.current = next;

      const params = new URLSearchParams(searchParams.toString());

      if (next) {
        params.set("q", next);
      } else {
        params.delete("q");
      }

      const query = params.toString();

      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value, q, pathname, router, searchParams]);

  const hasFilter = Boolean(q || tag);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <label htmlFor="bookmark-search" className="sr-only">
          搜索书签
        </label>
        <input
          id="bookmark-search"
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="按标题或网址搜索…"
          autoComplete="off"
          className={inputClass}
        />
        {pending ? (
          <span className="absolute top-2.5 right-3 text-xs text-black/40 dark:text-white/40">
            查询中…
          </span>
        ) : null}
      </div>

      {tags.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-1.5">
          <li className="text-xs text-black/50 dark:text-white/50">标签：</li>
          {tags.map((item) => {
            // 点已选中的标签 = 取消该筛选，省得用户去别处找入口。
            const nextTag = tag === item.name ? "" : item.name;

            return (
              <li key={item.name}>
                <Link
                  href={buildHref(pathname, q, nextTag)}
                  className={chipClass(tag === item.name)}
                  scroll={false}
                >
                  {item.name}
                  <span className="opacity-60">{item.count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      {hasFilter ? (
        <Link
          href={pathname}
          scroll={false}
          className="self-start text-xs text-black/60 underline dark:text-white/60"
        >
          清除筛选
        </Link>
      ) : null}
    </div>
  );
}
