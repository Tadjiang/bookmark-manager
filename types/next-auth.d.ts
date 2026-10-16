import type { DefaultSession } from "next-auth";

// 给 session 补上 user.id：Auth.js 默认的 Session["user"] 只有 name/email/image，
// 但书签业务（Day 4 起）需要稳定拿到当前用户主键。
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
