// Next.js 的 redirect() / notFound() 是靠**抛异常**中断渲染的（异常上带一个
// 以 NEXT_REDIRECT 开头的 digest）。
//
// 在 Server Action 里用 try/catch 包业务逻辑时必须把这类异常原样放行，否则
// "未登录 → 跳登录页"会被当成"保存失败"，用户看到的就是莫名其妙的报错。
// Day 3 的登录流程踩过同一个点，这里抽出来给两个 actions 模块共用。

export function isRedirectError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const digest = (error as { digest?: unknown }).digest;

  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}
