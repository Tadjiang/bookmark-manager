"use server";

// 书签的写操作（Server Actions）。
//
// 为什么不用 5 个 REST 路由：这是"本站 UI 驱动"的 CRUD，没有外部消费者。
// Server Action 省掉手写 fetch/JSON/错误映射三件套，并且能在同一次往返里把
// 变更后的 RSC payload 一起返回，所以新增/删除后列表立刻更新。
// 取舍记录见 DECISIONS.md 第 10 节。

import { refresh } from "next/cache";

import {
  readBookmarkForm,
  validateBookmarkInput,
  type BookmarkFieldErrors,
} from "@/lib/bookmark-input";
import { createBookmark, deleteBookmark, updateBookmark } from "@/lib/bookmarks";
import { isRedirectError } from "@/lib/redirect-error";

export type BookmarkFormState =
  | {
      /** 提交成功：表单据此清空输入 / 收起编辑框。 */
      ok?: boolean;
      /** 整体性错误（数据库异常等），不是某个字段的问题。 */
      error?: string;
      /** 字段级错误，原位回显在对应输入框下面。 */
      fieldErrors?: BookmarkFieldErrors;
    }
  | undefined;

function readId(formData: FormData): string {
  return String(formData.get("id") ?? "").trim();
}

export async function createBookmarkAction(
  _prev: BookmarkFormState,
  formData: FormData,
): Promise<BookmarkFormState> {
  // 客户端校验只是体验优化，服务端必须再校验一次（这里才是唯一可信的那道）。
  const result = validateBookmarkInput(readBookmarkForm(formData));

  if (!result.ok) {
    return { fieldErrors: result.fieldErrors };
  }

  try {
    await createBookmark(result.value);
  } catch (error) {
    // 会话过期时 requireUserId() 会 redirect("/signin")，那是控制流不是错误。
    if (isRedirectError(error)) {
      throw error;
    }

    console.error("创建书签失败", error);

    return { error: "保存失败，请稍后重试" };
  }

  // 列表是动态读（每次查库），refresh() 只重跑当前路由的动态部分，
  // 正好让新增的条目立刻出现在列表里（见 docs/DAY4-PLAN.md 第 1.3 节）。
  refresh();

  return { ok: true };
}

export async function updateBookmarkAction(
  _prev: BookmarkFormState,
  formData: FormData,
): Promise<BookmarkFormState> {
  const id = readId(formData);

  if (!id) {
    return { error: "缺少书签标识，请刷新页面后重试" };
  }

  const result = validateBookmarkInput(readBookmarkForm(formData));

  if (!result.ok) {
    return { fieldErrors: result.fieldErrors };
  }

  let updated: boolean;

  try {
    updated = await updateBookmark(id, result.value);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    console.error("更新书签失败", error);

    return { error: "保存失败，请稍后重试" };
  }

  if (!updated) {
    // 刻意不区分"不存在"和"不属于你"，避免用报错文案探测别人的书签 id。
    return { error: "这条书签不存在，可能已经被删除" };
  }

  refresh();

  return { ok: true };
}

/**
 * 删除。用普通表单 action（返回 void），配合客户端的二次确认。
 *
 * 失败时不把错误抛到界面上，而是留在列表里不动——用户能直观看到"没删掉"，
 * 比弹一个看不懂的错误页友好。
 */
export async function deleteBookmarkAction(formData: FormData): Promise<void> {
  const id = readId(formData);

  if (!id) {
    return;
  }

  try {
    await deleteBookmark(id);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    console.error("删除书签失败", error);

    return;
  }

  refresh();
}
