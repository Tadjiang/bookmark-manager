import type { NextAuthRequest } from "next-auth";
import { NextResponse } from "next/server";

import { auth } from "@/auth";

// Next.js 16 里 `middleware.ts` 已弃用并改名为 `proxy.ts`（见
// node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md）。
// 两个变化：文件与导出名换成 proxy，且 proxy 的运行时固定为 nodejs（不能再配 edge）。
//
// 用 Auth.js 的 auth 包一层：它会解析 JWT 会话，把 req.auth 填好。
//
// 这里刻意不依赖 auth.ts 里的 callbacks.authorized 来做跳转，而是自己判断并 redirect：
// authorized 返回 false 时 Auth.js 会跳它自己的默认地址，目标不够确定；
// 显式跳 /signin 并把原地址放进 callbackUrl，链接行为更可控、也方便调试。
//
// 按 Next 文档的建议，proxy 里只做"乐观检查"（只读 cookie 里的会话），
// 不查数据库——它会在每个匹配请求（含预取）上运行。
export default auth((request: NextAuthRequest) => {
  if (request.auth?.user) {
    return NextResponse.next();
  }

  const signInUrl = new URL("/signin", request.nextUrl.origin);
  signInUrl.searchParams.set(
    "callbackUrl",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );

  return NextResponse.redirect(signInUrl);
});

export const config = {
  // 只保护 /dashboard 及其子路径；其余路径（首页、登录、注册、/api/health 等）保持公开。
  matcher: ["/dashboard/:path*"],
};
