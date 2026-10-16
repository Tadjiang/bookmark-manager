// 密码哈希：用 Node 内置的 scrypt，不引第三方依赖。
//
// 为什么不用 bcrypt：bcrypt / bcryptjs 要么需要本地编译原生模块（本机缺 Python），
// 要么是纯 JS 实现（慢）；而 Node 从 v10 起就内置了 scrypt，属于内存硬函数，
// 抗 GPU 暴力破解的能力比 bcrypt 更好，且零依赖。
//
// 存储格式（自描述，方便以后换算法/调参而不破坏旧数据）：
//   scrypt$N$r$p$<salt base64>$<derivedKey base64>

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { ScryptOptions } from "node:crypto";

// 不用 promisify：scrypt 是重载签名，promisify 会把可选参数的类型丢掉，
// 传第四个 options 参数时 tsc 直接报 "Expected 3 arguments, but got 4"。
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

// 默认参数：N=2^15（32768）、r=8、p=1，派生 64 字节。
// N 越大越慢越安全；32768 在普通机器上约 50–100ms，适合登录接口，同时给暴力破解足够成本。
const PARAMS = { N: 32768, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// scrypt 的 maxmem 默认 32MB，而 N=32768、r=8 需要约 128 * N * r = 32MB 上限，
// 余量给足，避免 Node 直接抛 "memory limit exceeded"。
const MAX_MEM = 64 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password.normalize("NFKC"), salt, KEY_LENGTH, {
    ...PARAMS,
    maxmem: MAX_MEM,
  });

  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");

  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const [, n, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(keyB64, "base64");

  try {
    const derived = await scryptAsync(password.normalize("NFKC"), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: MAX_MEM,
    });

    // timingSafeEqual 要求长度一致，长度不同直接判否。
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    // 参数被篡改成非法值时不要抛给调用方，按"验证失败"处理。
    return false;
  }
}
