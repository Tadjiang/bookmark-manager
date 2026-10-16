// 给仓库内脚本用的小 loader。
//
// 解决两件 Node 原生解析做不到的事：
// 1. Prisma 生成的客户端（app/generated/prisma/*.ts）内部用的是打包器风格的
//    "无扩展名"相对导入（./enums、./internal/class），那是给 Next.js/Turbopack 解析的；
// 2. 项目源码用 tsconfig 的 paths 别名 `@/*` 指向仓库根目录。
//
// 只在脚本里 register，不进构建，也不影响 Next.js。
// 用法（必须在 import 目标模块之前注册）：
//   import { register } from "node:module";
//   register("./prisma-esm-hook.mjs", import.meta.url);

import { existsSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// 仓库根目录：以脚本的当前工作目录为准（脚本约定在仓库根目录下运行）。
const projectRoot = process.cwd();

const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs"];

// 把无扩展名的路径补成真实文件；找不到返回 undefined。
function firstExisting(basePath) {
  for (const extension of EXTENSIONS) {
    const candidate = `${basePath}${extension}`;

    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // 目录形式的导入（如 @/components → components/index.ts）
  for (const extension of EXTENSIONS) {
    const candidate = join(basePath, `index${extension}`);

    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export async function resolve(specifier, context, nextResolve) {
  // 1) tsconfig 的 `@/*` 别名 → 仓库根目录
  if (specifier.startsWith("@/")) {
    const resolved = firstExisting(join(projectRoot, specifier.slice(2)));

    if (resolved) {
      return nextResolve(pathToFileURL(resolved).href, context);
    }
  }

  // 2) 无扩展名的相对导入（Prisma 生成代码）
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(specifier);

  if (isRelative && !hasExtension) {
    const parent = context.parentURL ? dirname(fileURLToPath(context.parentURL)) : projectRoot;
    const resolved = firstExisting(resolvePath(parent, specifier));

    if (resolved) {
      try {
        return await nextResolve(pathToFileURL(resolved).href, context);
      } catch {
        // 落到默认解析，让原始错误暴露出来
      }
    }
  }

  // 3) 某些包内部用无扩展名的子路径导入（例如 next-auth 里的 `next/server`），
  //    Node 的 ESM 解析要求显式扩展名，补一个 .js 再试一次。
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!specifier.startsWith(".") && !/\.[a-zA-Z0-9]+$/.test(specifier)) {
      try {
        return await nextResolve(`${specifier}.js`, context);
      } catch {
        // 仍然失败就抛出原始错误
      }
    }

    throw error;
  }
}
