"use client";

// 新增 / 编辑书签共用的表单。
//
// 两个模式只差三点：有没有 id、默认值、提交后要不要收起。
// 合并成一个组件是为了让校验规则与错误展示只有一份实现。

import { useActionState, useEffect, useRef } from "react";

import {
  createBookmarkAction,
  updateBookmarkAction,
  type BookmarkFormState,
} from "@/app/actions/bookmarks";
import {
  FieldError,
  FormError,
  ghostButtonClass,
  inputClass,
  labelClass,
  primaryButtonClass,
} from "@/app/dashboard/form-ui";
import {
  formatTags,
  MAX_DESCRIPTION_LENGTH,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  MAX_TITLE_LENGTH,
} from "@/lib/bookmark-input";

export type BookmarkFormValues = {
  id: string;
  url: string;
  title: string;
  description: string | null;
  tags: { name: string }[];
};

type BookmarkFormProps = {
  mode: "create" | "edit";
  bookmark?: BookmarkFormValues;
  /** 编辑模式下用来收起表单；新增模式下不传。 */
  onDone?: () => void;
};

export function BookmarkForm({ mode, bookmark, onDone }: BookmarkFormProps) {
  const [state, formAction, pending] = useActionState<BookmarkFormState, FormData>(
    mode === "create" ? createBookmarkAction : updateBookmarkAction,
    undefined,
  );

  const formRef = useRef<HTMLFormElement>(null);
  // 回调存进 ref：父组件传进来的多半是行内箭头函数，每次渲染都是新身份，
  // 直接把它写进 effect 依赖会让"提交成功"的副作用反复触发。
  // 注意只能在 effect 里写 ref.current，渲染期赋值会被 react-hooks/refs 规则拦下。
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (state?.ok) {
      // 成功后清空输入（编辑模式下紧接着会被父组件收起）。
      formRef.current?.reset();
      onDoneRef.current?.();
    }
  }, [state]);

  // label 的 htmlFor 必须唯一：同一页面上可能同时存在新增表单与某个编辑表单。
  const idPrefix = mode === "create" ? "bookmark-new" : `bookmark-${bookmark?.id ?? "edit"}`;
  const isCreate = mode === "create";

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      {!isCreate ? <input type="hidden" name="id" value={bookmark?.id ?? ""} /> : null}

      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-url`}>
          网址
        </label>
        <input
          id={`${idPrefix}-url`}
          name="url"
          type="url"
          required
          inputMode="url"
          autoComplete="off"
          placeholder="https://example.com"
          defaultValue={bookmark?.url ?? ""}
          className={inputClass}
          aria-invalid={state?.fieldErrors?.url ? true : undefined}
        />
        <FieldError message={state?.fieldErrors?.url} />
      </div>

      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-title`}>
          标题
        </label>
        <input
          id={`${idPrefix}-title`}
          name="title"
          type="text"
          required
          maxLength={MAX_TITLE_LENGTH}
          defaultValue={bookmark?.title ?? ""}
          className={inputClass}
          aria-invalid={state?.fieldErrors?.title ? true : undefined}
        />
        <FieldError message={state?.fieldErrors?.title} />
      </div>

      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-description`}>
          描述（可选）
        </label>
        <textarea
          id={`${idPrefix}-description`}
          name="description"
          rows={2}
          maxLength={MAX_DESCRIPTION_LENGTH}
          defaultValue={bookmark?.description ?? ""}
          className={inputClass}
          aria-invalid={state?.fieldErrors?.description ? true : undefined}
        />
        <FieldError message={state?.fieldErrors?.description} />
      </div>

      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-tags`}>
          标签（可选，用逗号分隔）
        </label>
        <input
          id={`${idPrefix}-tags`}
          name="tags"
          type="text"
          autoComplete="off"
          placeholder="工作, 前端"
          defaultValue={formatTags(bookmark?.tags.map((tag) => tag.name) ?? [])}
          className={inputClass}
          aria-invalid={state?.fieldErrors?.tags ? true : undefined}
        />
        <FieldError message={state?.fieldErrors?.tags} />
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          最多 {MAX_TAGS} 个，每个不超过 {MAX_TAG_LENGTH} 个字符，会自动转成小写去重。
        </p>
      </div>

      <FormError message={state?.error} />

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "保存中…" : isCreate ? "添加书签" : "保存修改"}
        </button>

        {!isCreate ? (
          <button type="button" onClick={() => onDone?.()} className={ghostButtonClass}>
            取消
          </button>
        ) : null}
      </div>
    </form>
  );
}
