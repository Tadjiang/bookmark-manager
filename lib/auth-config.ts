// 认证相关的环境变量判断集中在这里，客户端组件和服务端组件都能安全地引用
// （只读 process.env，不涉及数据库或密钥本身的输出）。

// GitHub OAuth 是否可用：两个变量都配齐才算启用。
export const githubAuthEnabled = Boolean(
  process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET,
);
