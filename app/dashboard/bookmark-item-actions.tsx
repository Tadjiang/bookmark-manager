"use client";

// 单条书签的「编辑 / 删除」操作区。
//
// 编辑用行内展开而不是跳独立页面：列表本来就在手边，改完立刻能看到结果，
// 也少一个路由和一次往返。展开状态是纯客户端的，不需要写进 URL。

import { useState } from "react";

import { BookmarkForm, type BookmarkFormValues } from "@/app/dashboard/bookmark-form";
import { DeleteButton } from "@/app/dashboard/delete-button";
import { ghostButtonClass } from "@/app/dashboard/form-ui";

export function BookmarkItemActions({ bookmark }: { bookmark: BookmarkFormValues }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="mt-3 border-t border-black/[.08] pt-3 dark:border-white/[.12]">
        <BookmarkForm mode="edit" bookmark={bookmark} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-expanded={false}
        className={ghostButtonClass}
      >
        编辑
      </button>
      <DeleteButton id={bookmark.id} title={bookmark.title} />
    </div>
  );
}
