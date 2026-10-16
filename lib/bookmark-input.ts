// 书签输入校验与标签归一化。
//
// 刻意写成**纯函数**：不碰数据库、不读会话、不依赖 Next.js 运行时，
// 因此可以在最便宜的层面先测一遍（`node scripts/verify-bookmark-input.mjs`），
// Server Action 与将来可能加的 REST 接口都复用同一套规则，不会出现"两套校验"。

export const MAX_URL_LENGTH = 2048;
export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_TAG_LENGTH = 30;
export const MAX_TAGS = 10;

export type BookmarkField = "url" | "title" | "description" | "tags";

export type BookmarkFieldErrors = Partial<Record<BookmarkField, string>>;

/** 表单原始输入（全部是字符串，来自 FormData）。 */
export type BookmarkRawInput = {
  url: string;
  title: string;
  description: string;
  tags: string;
};

/** 校验通过后的值，可以直接交给数据访问层。 */
export type BookmarkInput = {
  url: string;
  title: string;
  description: string | null;
  tags: string[];
};

export type BookmarkValidation =
  | { ok: true; value: BookmarkInput }
  | { ok: false; fieldErrors: BookmarkFieldErrors };

/** 去掉首尾空白并把连续空白折叠成一个空格。 */
export function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * 标签名的唯一形态。
 *
 * 为什么要转小写：`Tag` 的唯一约束是 `@@unique([userId, name])`，而 SQLite 的
 * 字符串比较**区分大小写**——不统一大小写的话 `Work` 与 `work` 会各插一行，
 * 界面和筛选就会出现两个看起来一样的标签。归一化放在写入前，读的时候
 * （筛选 `?tag=`）也用同一个函数，两边才对称。
 */
export function normalizeTagName(value: string): string {
  return collapseWhitespace(value).toLowerCase();
}

/**
 * 把「逗号分隔的标签名」解析成去重后的标签数组。
 *
 * 规则：折叠空白 → 转小写 → 丢弃空串 → 按小写去重 → 单个 ≤ 30 字符、最多 10 个。
 * 超出上限时**不静默丢弃**：记下错误，让整个表单提交失败并回显，避免用户以为存上了。
 */
export function parseTags(raw: string): { tags: string[]; error?: string } {
  const seen = new Set<string>();
  const tags: string[] = [];
  let error: string | undefined;

  for (const part of raw.split(/[,，]/)) {
    const name = normalizeTagName(part);

    if (!name) {
      continue;
    }

    if (name.length > MAX_TAG_LENGTH) {
      error ??= `单个标签不能超过 ${MAX_TAG_LENGTH} 个字符`;
      continue;
    }

    if (seen.has(name)) {
      continue;
    }

    if (tags.length >= MAX_TAGS) {
      error ??= `最多只能添加 ${MAX_TAGS} 个标签`;
      continue;
    }

    seen.add(name);
    tags.push(name);
  }

  return error ? { tags, error } : { tags };
}

/** 把标签数组还原成表单里的逗号分隔文本。 */
export function formatTags(tags: readonly string[]): string {
  return tags.join(", ");
}

/**
 * 校验并规范化 URL。
 *
 * 关键是协议白名单：`new URL("javascript:alert(1)")` **能解析成功**，
 * 所以只判断"能不能 new URL"是不够的，必须显式限制 http/https，
 * 否则存进去的链接会在列表里被渲染成可点的 XSS 入口。
 */
export function normalizeUrl(
  raw: string,
): { ok: true; url: string } | { ok: false; reason: string } {
  const value = raw.trim();

  if (!value) {
    return { ok: false, reason: "请填写网址" };
  }

  if (value.length > MAX_URL_LENGTH) {
    return { ok: false, reason: `网址不能超过 ${MAX_URL_LENGTH} 个字符` };
  }

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: "网址格式不正确，请以 http:// 或 https:// 开头" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "只支持 http:// 或 https:// 开头的网址" };
  }

  // 用 toString() 的规范化结果入库（补全尾部斜杠、统一百分号编码）。
  return { ok: true, url: parsed.toString() };
}

/** 服务端校验入口：返回结构化的字段错误，方便原样回填表单。 */
export function validateBookmarkInput(raw: BookmarkRawInput): BookmarkValidation {
  const fieldErrors: BookmarkFieldErrors = {};

  const url = normalizeUrl(raw.url);

  if (!url.ok) {
    fieldErrors.url = url.reason;
  }

  const title = collapseWhitespace(raw.title);

  if (!title) {
    fieldErrors.title = "请填写标题";
  } else if (title.length > MAX_TITLE_LENGTH) {
    fieldErrors.title = `标题不能超过 ${MAX_TITLE_LENGTH} 个字符`;
  }

  const description = raw.description.trim();

  if (description.length > MAX_DESCRIPTION_LENGTH) {
    fieldErrors.description = `描述不能超过 ${MAX_DESCRIPTION_LENGTH} 个字符`;
  }

  const tags = parseTags(raw.tags);

  if (tags.error) {
    fieldErrors.tags = tags.error;
  }

  if (!url.ok || Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    value: {
      url: url.url,
      title,
      description: description || null,
      tags: tags.tags,
    },
  };
}

/** 从 FormData 里取出四个原始字段（缺失一律当空串，长度上限由校验负责）。 */
export function readBookmarkForm(formData: FormData): BookmarkRawInput {
  return {
    url: String(formData.get("url") ?? ""),
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    tags: String(formData.get("tags") ?? ""),
  };
}

/** 列表里展示用的域名（整串 URL 太长，读起来也慢）。 */
export function displayHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
