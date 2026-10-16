// 表单共用的样式常量与小组件。
// 单独放一个文件，是为了让"新增"和"编辑"两个表单（其实是同一个组件）长得完全一致，
// 也避免样式字符串在五六个文件里各写一遍、改一处漏一处。

export const inputClass =
  "w-full rounded-lg border border-black/[.12] bg-white px-3 py-2 text-sm outline-none transition focus:border-black/40 dark:border-white/[.18] dark:bg-black dark:focus:border-white/50";

export const labelClass = "mb-1 block text-sm font-medium";

export const primaryButtonClass =
  "rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-white/80";

export const ghostButtonClass =
  "rounded-lg border border-black/[.12] px-3 py-1.5 text-sm transition hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[.18] dark:hover:bg-white/[.06]";

export const cardClass =
  "rounded-xl border border-black/[.08] p-4 dark:border-white/[.12]";

/** 字段级错误：原位回显在对应输入框下面，用 role="alert" 让读屏软件也能感知。 */
export function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}

/** 整体性错误（不是某个字段的问题）。 */
export function FormError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <p
      role="alert"
      className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300"
    >
      {message}
    </p>
  );
}
