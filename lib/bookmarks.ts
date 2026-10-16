// 书签的数据访问层（Data Access Layer）。
//
// 唯一纪律：**每个导出函数的第一件事都是取会话并校验 userId**，绝不接受调用方传入 userId。
// 越权防护全靠这一条；一旦散落到各个组件里，迟早会漏掉一处（Next 官方也推荐把
// 鉴权收敛到 DAL，见 node_modules/next/dist/docs 的 data-security 指南）。

import { redirect } from "next/navigation";

import type { Prisma } from "@/app/generated/prisma/client";
import { auth } from "@/auth";
import { normalizeTagName, type BookmarkInput } from "@/lib/bookmark-input";
import { getPrisma } from "@/lib/prisma";

/** 列表一次最多取多少条。本日不做分页，先用上限收口，避免数据涨上来后页面变慢。 */
export const MAX_BOOKMARKS = 200;

// 返回值用 select 白名单，而不是整行：书签本身没有敏感字段，
// 但保持习惯，将来加字段（比如内部备注）时不会顺手泄漏出去。
const bookmarkSelect = {
  id: true,
  url: true,
  title: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  tags: { select: { name: true }, orderBy: { name: "asc" } },
} satisfies Prisma.BookmarkSelect;

export type BookmarkWithTags = {
  id: string;
  url: string;
  title: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  tags: { name: string }[];
};

export type BookmarkListResult = {
  items: BookmarkWithTags[];
  /** 是否触到 MAX_BOOKMARKS 上限（UI 需要提示"仅显示最近 N 条"）。 */
  truncated: boolean;
};

export type BookmarkQuery = {
  q?: string;
  tag?: string;
};

/**
 * 取当前登录用户的 id；未登录直接跳登录页。
 *
 * 不导出：只在本模块内部用，避免别处绕过它自己读会话。
 */
async function requireUserId(): Promise<string> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/signin");
  }

  return session.user.id;
}

function buildWhere(userId: string, options: BookmarkQuery): Prisma.BookmarkWhereInput {
  const where: Prisma.BookmarkWhereInput = { userId };
  const keyword = options.q?.trim();

  if (keyword) {
    // SQLite 的 LIKE 对 ASCII 大小写不敏感（Prisma 的 `mode: "insensitive"` 在 SQLite 上不可用），
    // 中文本来也没有大小写问题，所以这里不需要额外 lower()。
    where.OR = [{ title: { contains: keyword } }, { url: { contains: keyword } }];
  }

  const tagName = normalizeTagName(options.tag ?? "");

  if (tagName) {
    // 与上面的 OR 同时出现时，Prisma 组合出来就是 AND（关键词命中 且 带该标签）。
    where.tags = { some: { name: tagName } };
  }

  return where;
}

/** 只返回 id 的归属校验：Prisma 的 update/delete 只接受唯一键，没法在 where 里同时限定 userId。 */
async function findOwnedId(id: string, userId: string): Promise<boolean> {
  const owned = await getPrisma().bookmark.findFirst({
    where: { id, userId },
    select: { id: true },
  });

  return owned !== null;
}

/**
 * 按 (userId, name) 复用标签行。
 *
 * `Tag` 上有 `@@unique([userId, name])`，所以 upsert 天然幂等：同一批标签
 * 重复保存不会产生新行。名字已经在 `parseTags` 里归一化（小写 + 折叠空白），
 * 与 SQLite 区分大小写的字符串比较配合才不会出现两个看起来一样的标签。
 */
async function ensureTags(userId: string, names: readonly string[]) {
  const prisma = getPrisma();

  return Promise.all(
    names.map((name) =>
      prisma.tag.upsert({
        where: { userId_name: { userId, name } },
        create: { userId, name },
        update: {},
        select: { id: true },
      }),
    ),
  );
}

/** 列表 + 关键词/标签筛选。只返回当前登录用户的书签。 */
export async function listBookmarks(options: BookmarkQuery = {}): Promise<BookmarkListResult> {
  const userId = await requireUserId();

  // 多取一条用来判断"是否还有更多"，比再发一次 count 便宜。
  const rows = await getPrisma().bookmark.findMany({
    where: buildWhere(userId, options),
    select: bookmarkSelect,
    orderBy: { createdAt: "desc" },
    take: MAX_BOOKMARKS + 1,
  });

  return {
    items: rows.slice(0, MAX_BOOKMARKS),
    truncated: rows.length > MAX_BOOKMARKS,
  };
}

/** 单条查询。**必须带 userId**：只按 id 查会让登录用户读到别人的书签。 */
export async function getBookmark(id: string): Promise<BookmarkWithTags | null> {
  const userId = await requireUserId();

  return getPrisma().bookmark.findFirst({ where: { id, userId }, select: bookmarkSelect });
}

export async function createBookmark(input: BookmarkInput): Promise<{ id: string }> {
  const userId = await requireUserId();
  const tags = await ensureTags(userId, input.tags);

  return getPrisma().bookmark.create({
    data: {
      userId,
      url: input.url,
      title: input.title,
      description: input.description,
      tags: { connect: tags },
    },
    select: { id: true },
  });
}

/** 返回是否真的改了：false 表示这条书签不存在或不属于当前用户（对外统一成"没找到"）。 */
export async function updateBookmark(id: string, input: BookmarkInput): Promise<boolean> {
  const userId = await requireUserId();

  if (!(await findOwnedId(id, userId))) {
    return false;
  }

  const tags = await ensureTags(userId, input.tags);

  await getPrisma().bookmark.update({
    where: { id },
    data: {
      url: input.url,
      title: input.title,
      description: input.description,
      // set 覆盖旧关联；传空数组即清空标签。
      tags: { set: tags },
    },
  });

  return true;
}

/** 返回是否真的删了：false 表示不存在或不属于当前用户。 */
export async function deleteBookmark(id: string): Promise<boolean> {
  const userId = await requireUserId();

  // deleteMany 允许在 where 里带 userId，正好表达"只能删自己的"，
  // 而且不需要先查一次（也就没有 TOCTOU 窗口）。
  const result = await getPrisma().bookmark.deleteMany({ where: { id, userId } });

  return result.count > 0;
}

/** 供筛选栏与将来的自动补全使用。 */
export async function listTags(): Promise<{ name: string; count: number }[]> {
  const userId = await requireUserId();

  const rows = await getPrisma().tag.findMany({
    where: { userId },
    select: { name: true, _count: { select: { bookmarks: true } } },
    orderBy: { name: "asc" },
  });

  return rows.map((row) => ({ name: row.name, count: row._count.bookmarks }));
}
