"use client";

// 删除按钮：二次确认 + 提交删除 Server Action。
//
// 用原生 <form action={serverAction}> 而不是 onClick 调函数：
// 这样即使 JS 还没水合完也能提交（渐进增强），并且能用 useFormStatus 拿到 pending。
// 确认走 button 的 onClick + preventDefault —— 点取消时原生 submit 根本不会发生。

import { useFormStatus } from "react-dom";

import { deleteBookmarkAction } from "@/app/actions/bookmarks";

function DeleteSubmitButton({ title }: { title: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={`删除书签：${title}`}
      onClick={(event) => {
        // MVP 用 window.confirm：零依赖、键盘可达，也比自造弹窗少一堆焦点管理代码。
        if (!window.confirm(`确定删除「${title}」吗？此操作不可撤销。`)) {
          event.preventDefault();
        }
      }}
      className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
    >
      {pending ? "删除中…" : "删除"}
    </button>
  );
}

export function DeleteButton({ id, title }: { id: string; title: string }) {
  return (
    <form action={deleteBookmarkAction}>
      <input type="hidden" name="id" value={id} />
      <DeleteSubmitButton title={title} />
    </form>
  );
}
