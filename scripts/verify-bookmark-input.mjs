// 书签输入校验 / 标签归一化的探针：只测纯函数，不碰数据库、不需要 dev server，
// 因此在最受限的环境里也能跑（Day 3 的 verify-auth-guards.mjs 是同一个思路）。
//
// 用法：
//   node scripts/verify-bookmark-input.mjs
//
// 覆盖：
//   - 必填校验：空标题、空 URL、非法 URL、协议白名单（挡 javascript: / data:）
//   - 长度上限：标题、描述、URL、单标签、标签数量
//   - 标签归一化：折叠空白 + 转小写 + 去重（Work / work / WORK 只留一个）
//   - 静态护栏：数据访问层必须处处带上 userId，Server Action 必须调 refresh()

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { register } from "node:module";

// 生成的 Prisma 客户端用的是无扩展名相对导入，Node 的 ESM 解析器认不了；
// 这里虽然用不到 Prisma，但 hook 同时负责把 ../lib/*.ts 的裸相对导入补成 .ts。
register("./prisma-esm-hook.mjs", import.meta.url);

const {
  collapseWhitespace,
  displayHostname,
  formatTags,
  normalizeTagName,
  normalizeUrl,
  parseTags,
  validateBookmarkInput,
  MAX_DESCRIPTION_LENGTH,
  MAX_TAG_LENGTH,
  MAX_TAGS,
  MAX_TITLE_LENGTH,
  MAX_URL_LENGTH,
} = await import("../lib/bookmark-input.ts");

let failures = 0;

function assert(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}`);

  if (!condition) {
    failures += 1;
  }
}

console.log("---------- 1. normalizeUrl：协议白名单与规范化 ----------");

const rejectedUrls = [
  ["空串", ""],
  ["只有空格", "   "],
  ["没有协议头", "example.com"],
  ["javascript: 伪协议", "javascript:alert(1)"],
  ["JaVaScRiPt: 大小写变体", "JaVaScRiPt:alert(1)"],
  ["data: 伪协议", "data:text/html,<script>alert(1)</script>"],
  ["vbscript: 伪协议", "vbscript:msgbox(1)"],
  ["file: 本地文件", "file:///C:/Windows/win.ini"],
  ["ftp: 协议", "ftp://example.com/a"],
  ["只有协议头", "https://"],
  ["超长 URL", `https://example.com/${"a".repeat(MAX_URL_LENGTH)}`],
];

for (const [label, value] of rejectedUrls) {
  const result = normalizeUrl(value);
  assert(`拒绝 ${label}`, result.ok === false);
}

const acceptedUrls = [
  ["https 基本形态", "https://example.com", "https://example.com/"],
  ["http 基本形态", "http://example.com/a/b", "http://example.com/a/b"],
  ["首尾空格应被 trim", "  https://example.com/x  ", "https://example.com/x"],
  ["大写协议应被接受", "HTTPS://Example.com/Path", "https://example.com/Path"],
  ["带查询串与锚点", "https://example.com/a?b=1#c", "https://example.com/a?b=1#c"],
  ["中文路径", "https://example.com/我的书签", "https://example.com/%E6%88%91%E7%9A%84%E4%B9%A6%E7%AD%BE"],
];

for (const [label, value, expected] of acceptedUrls) {
  const result = normalizeUrl(value);
  assert(
    `接受 ${label} → ${expected}`,
    result.ok === true && result.url === expected,
  );
}

console.log("---------- 2. 标签归一化 ----------");

assert("normalizeTagName 折叠空白并转小写", normalizeTagName("  Work   From  Home ") === "work from home");
assert("normalizeTagName 容忍中文", normalizeTagName(" 前端 ") === "前端");

const merged = parseTags("Work, work , WORK ,,  ");
assert(
  "Work/work/WORK 合成一个标签",
  merged.tags.length === 1 && merged.tags[0] === "work" && merged.error === undefined,
);

const multi = parseTags("前端, 后端，数据库, 前端");
assert(
  "中文逗号也当分隔符，且去重",
  multi.tags.join(",") === "前端,后端,数据库",
);

const empty = parseTags(" , ,, ");
assert("全是空标签时返回空数组", empty.tags.length === 0 && empty.error === undefined);

const tooLong = parseTags("a".repeat(MAX_TAG_LENGTH + 1));
assert("超长标签被拒", tooLong.error !== undefined && tooLong.tags.length === 0);

const tooMany = parseTags(
  Array.from({ length: MAX_TAGS + 3 }, (_, index) => `tag${index}`).join(","),
);
assert(
  `标签数量超过 ${MAX_TAGS} 被拒`,
  tooMany.error !== undefined && tooMany.tags.length === MAX_TAGS,
);

assert("formatTags 可往返", formatTags(["a", "b"]) === "a, b");

console.log("---------- 3. validateBookmarkInput：必填与上限 ----------");

const valid = validateBookmarkInput({
  url: "https://example.com/a",
  title: "  一个   标题  ",
  description: "   ",
  tags: "Work, work",
});

assert("合法输入通过", valid.ok === true);
assert("标题折叠空白", valid.ok === true && valid.value.title === "一个 标题");
assert("空白描述归一化成 null", valid.ok === true && valid.value.description === null);
assert("标签已归一化", valid.ok === true && valid.value.tags.join() === "work");

const noTitle = validateBookmarkInput({ url: "https://example.com", title: "   ", description: "", tags: "" });
assert(
  "空标题被拒并带字段错误",
  noTitle.ok === false && typeof noTitle.fieldErrors.title === "string",
);

const noUrl = validateBookmarkInput({ url: "", title: "标题", description: "", tags: "" });
assert("空 URL 被拒", noUrl.ok === false && typeof noUrl.fieldErrors.url === "string");

const badProtocol = validateBookmarkInput({
  url: "javascript:alert(1)",
  title: "标题",
  description: "",
  tags: "",
});
assert("javascript: 被拒", badProtocol.ok === false && typeof badProtocol.fieldErrors.url === "string");

const longTitle = validateBookmarkInput({
  url: "https://example.com",
  title: "t".repeat(MAX_TITLE_LENGTH + 1),
  description: "",
  tags: "",
});
assert("超长标题被拒", longTitle.ok === false && typeof longTitle.fieldErrors.title === "string");

const longDescription = validateBookmarkInput({
  url: "https://example.com",
  title: "标题",
  description: "d".repeat(MAX_DESCRIPTION_LENGTH + 1),
  tags: "",
});
assert(
  "超长描述被拒",
  longDescription.ok === false && typeof longDescription.fieldErrors.description === "string",
);

const manyErrors = validateBookmarkInput({ url: "", title: "", description: "", tags: "x".repeat(MAX_TAG_LENGTH + 1) });
assert(
  "多个字段同时出错时全部回填",
  manyErrors.ok === false &&
    Object.keys(manyErrors.fieldErrors).sort().join() === "tags,title,url",
);

console.log("---------- 4. collapseWhitespace / displayHostname ----------");

assert("collapseWhitespace 保留单个空格", collapseWhitespace("  a \t\n b  ") === "a b");
assert("displayHostname 去掉 www", displayHostname("https://www.example.com/a") === "example.com");
assert("displayHostname 解析失败时原样返回", displayHostname("not-a-url") === "not-a-url");

console.log("---------- 5. 静态护栏：越权防护与刷新 ----------");

function read(relativePath) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

/** 去掉注释后再做特征匹配：这几处"反例"本身就写在了注释里（比如那句段配置警告）。 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const dal = read("lib/bookmarks.ts");
const actions = read("app/actions/bookmarks.ts");
const dashboard = read("app/dashboard/page.tsx");
const bookmarkList = read("app/dashboard/bookmark-list.tsx");

// 数据访问层的所有函数都不允许接受调用方传入的 userId——
// 一旦接受，越权防护就退化成了"调用方自觉"。
const exportedParams = [...dal.matchAll(/export async function \w+\(([^)]*)\)/g)].map(
  (match) => match[1],
);
assert(
  "数据访问层没有导出接收 userId 的函数",
  exportedParams.length > 0 && exportedParams.every((params) => !/userId/.test(params)),
);

assert(
  "getBookmark 按 (id, userId) 查",
  /findFirst\(\{\s*where:\s*\{\s*id,\s*userId\s*\}/.test(dal),
);
assert(
  "deleteBookmark 用 deleteMany 且带 userId",
  /deleteMany\(\{\s*where:\s*\{\s*id,\s*userId\s*\}\s*\}\)/.test(dal),
);
assert(
  "updateBookmark 先做归属校验（findOwnedId 内含 id + userId）",
  /findOwnedId\(id,\s*userId\)/.test(dal) && /where:\s*\{\s*id,\s*userId\s*\}/.test(dal),
);
assert("listBookmarks 的 where 起点是 { userId }", /BookmarkWhereInput\s*=\s*\{\s*userId\s*\}/.test(dal));

assert("Server Actions 调用了 refresh()", /refresh\(\)/.test(actions));
assert(
  "Server Actions 用 isRedirectError 放行跳转控制流",
  /isRedirectError/.test(actions),
);

// cacheComponents 下写了段配置会让整条路由编译失败（ISSUES #7）。
assert(
  "dashboard 页面没有写 dynamic 段配置",
  !/export const dynamic\s*=/.test(stripComments(dashboard)),
);

// 列表页必须把 query 参数透给列表组件，否则搜索/筛选不会生效。
assert("列表页挂载了 BookmarkList", /<BookmarkList\b/.test(dashboard));
assert("BookmarkList 里 await 了 searchParams", /await searchParams/.test(bookmarkList));

console.log(`\n${failures === 0 ? "RESULT_OK" : `RESULT_FAIL ${failures} 项未通过`}`);
process.exitCode = failures === 0 ? 0 : 1;
