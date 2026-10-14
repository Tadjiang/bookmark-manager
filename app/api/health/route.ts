import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

// 数据库连通性自检：确认 Next.js + Prisma 7 + driver adapter 链路正常。
export async function GET() {
  try {
    const [users, bookmarks, tags] = await Promise.all([
      prisma.user.count(),
      prisma.bookmark.count(),
      prisma.tag.count(),
    ]);

    // 数据量只在本地开发环境暴露，避免线上公网泄露统计信息。
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({ ok: true, users, bookmarks, tags });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
