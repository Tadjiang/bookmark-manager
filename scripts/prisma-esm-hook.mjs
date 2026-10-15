// 给 scripts/verify-day2-probe.mjs 用的小 loader。
//
// 为什么需要：Prisma 生成的客户端（app/generated/prisma/*.ts）内部用的是
// 打包器风格的"无扩展名"相对导入（./enums、./internal/class），那是给
// Next.js/Turbopack 解析的；Node 自己按 ESM 规则解析会直接 ERR_MODULE_NOT_FOUND。
// 这个 hook 把这类裸相对导入补成 .ts，Node 24 自带类型擦除就能直接跑。
//
// 只在探针脚本里注册，不进构建，也不影响 Next.js。

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const hasExtension = /\.[a-zA-Z0-9]+$/.test(specifier);

    if (!hasExtension) {
      try {
        return await nextResolve(`${specifier}.ts`, context);
      } catch {
        // 回落到默认解析，让原始错误原样暴露
      }
    }
  }

  return nextResolve(specifier, context);
}
