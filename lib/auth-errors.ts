// 把 Auth.js 回跳时带在 URL 上的 ?error= 转成可读文案。
//
// Auth.js v5 在重定向回登录页时会附上错误码（对应 @auth/core/errors 里的类名）。
// 不处理的话用户只会看到一条光秃秃的 "OAuthAccountNotLinked"，完全不知道下一步该做什么。
//
// 错误码来源：node_modules/@auth/core/errors.d.ts 里导出的类名。

const ERROR_MESSAGES: Record<string, string> = {
  // 同一个邮箱先用邮箱密码注册、后来又用 GitHub 登录时触发。
  // Auth.js 默认不会自动把两个身份合并（这是有意的安全设计，防止账号被冒认）。
  OAuthAccountNotLinked:
    "该邮箱已用「邮箱密码」注册过。请改用邮箱密码登录；若确实要用 GitHub，请先登录后在设置中绑定。",
  AccountNotLinked: "该账号已用其他方式注册，请使用原来的登录方式。",
  AccessDenied: "登录被拒绝：可能是授权时点了取消，或该账号没有访问权限。",
  Configuration: "认证配置有误（通常是缺少或写错了 AUTH_* 环境变量），请检查 .env 后重启服务。",
  Verification: "登录链接已失效或已被使用，请重新发起登录。",
  CredentialsSignin: "邮箱或密码不正确。",
  MissingCSRF: "请求校验失败（CSRF），请刷新页面后重试。",
  UntrustedHost: "服务不信任当前请求的域名，本地开发请在 .env 里设置 AUTH_TRUST_HOST=true。",
  OAuthCallbackError: "GitHub 回调失败，请重试；若持续失败请检查 OAuth App 的回调地址是否精确匹配。",
  OAuthSignInError: "无法发起 GitHub 登录，请检查网络或 OAuth App 配置。",
  SessionTokenError: "会话已失效，请重新登录。",
  JWTSessionError: "会话解析失败，可能 AUTH_SECRET 被改过，请重新登录。",
  MissingSecret: "缺少 AUTH_SECRET，请在 .env 中配置后重启服务。",
};

/**
 * 返回给用户看的错误文案；没有错误码时返回 undefined。
 * 未知错误码也给出兜底文案，避免直接暴露内部类名。
 */
export function authErrorMessage(code: unknown): string | undefined {
  if (typeof code !== "string" || code.length === 0) {
    return undefined;
  }

  return ERROR_MESSAGES[code] ?? "登录失败，请重试；若持续失败请查看服务端日志。";
}
