// 回调地址的净化工具。
//
// 为什么必须有：登录页会读取 ?callbackUrl= 并在登录成功后跳过去。如果直接信任这个值，
// 攻击者可以构造 /signin?callbackUrl=https://evil.example.com，让用户在"我们自己站点"上
// 点登录、结果被送到外部站点（open redirect，常被用来做钓鱼跳板）。
// 所以只接受站内相对路径，其余一律回落到 /dashboard。

export const DEFAULT_AUTH_REDIRECT = "/dashboard";

/**
 * 把任意输入净化成安全的站内跳转路径。
 *
 * - 只接受以单个 `/` 开头的路径；
 * - 拒绝 `//host`（协议相对地址）与 `/\host`（浏览器会当协议相对处理）；
 * - 拒绝包含控制字符或反斜杠的输入；
 * - 其余情况返回 fallback。
 */
export function safeCallbackUrl(
  candidate: unknown,
  fallback: string = DEFAULT_AUTH_REDIRECT,
): string {
  if (typeof candidate !== "string") {
    return fallback;
  }

  const value = candidate.trim();

  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }

  // 反斜杠在部分浏览器里等价于 `/`，一并拒绝以免绕过 `//` 检查
  if (value.includes("\\")) {
    return fallback;
  }

  // 控制字符（含 \r\n）可用于响应头注入
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return fallback;
  }

  return value;
}
