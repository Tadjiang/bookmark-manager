# 书签管理器 MVP - 任务清单

## 项目目标
极简书签管理器 MVP - 核心功能为：快速保存、组织、搜索书签

## 技术栈
- **前端框架**：Next.js 16 (App Router) + React 19 + TypeScript
- **样式**：Tailwind CSS 4
- **数据库**：SQLite (本地) / PostgreSQL (线上)
- **ORM**：Prisma
- **认证**：NextAuth.js
- **部署**：Vercel

## 功能清单

### P0 - MVP 核心功能（第一阶段）
- [ ] 用户认证（登录/注册/登出）
- [ ] 添加书签（URL + 标题 + 描述 + 分类标签）
- [ ] 书签列表展示
- [ ] 搜索书签（按标题/URL）
- [ ] 删除书签
- [ ] 基础 UI（响应式设计）

### P1 - 功能增强（第二阶段）
- [ ] 编辑书签
- [ ] 按分类筛选
- [ ] 书签导入（HTML 格式）
- [ ] 书签导出（HTML 格式）
- [ ] 暗黑模式切换
- [ ] 分页 / 无限滚动

### P2 - 高级功能（第三阶段）
- [ ] 书签收藏夹
- [ ] 分享功能
- [ ] 书签统计面板
- [ ] 浏览器扩展
- [ ] 全文搜索优化
- [ ] 团队协作

## 当前进度

### ✅ Day 1 - 初始化 + 部署完成
- [x] 使用 create-next-app 初始化项目
- [x] 配置 TypeScript + ESLint
- [x] 集成 Tailwind CSS 4
- [x] 初始化 Git 仓库
- [x] 推送到 GitHub (main 分支)

### ✅ Day 2 - 数据库 + ORM 配置完成
- [x] 初始化 Prisma（7.10.0 ORM CLI）
- [x] 配置 SQLite 本地数据库
- [x] 设计数据模型（认证 4 张表 + 业务 2 张表）
- [x] 生成 Prisma Client
- [x] 创建迁移文件（`20261014073756_init`）
- [x] 配置 driver adapter（Prisma 7 强制要求）
- [x] 端到端验证：`/api/health` 读写通过、`next build` 通过

## 下一步

### 🚀 Day 2 - 数据库 + ORM 配置
- [x] 初始化 Prisma
- [x] 配置 SQLite 本地数据库
- [x] 设计数据模型（User, Bookmark, Tag）
- [x] 生成 Prisma Client
- [x] 创建迁移文件

### 🔐 Day 3 - 用户认证
- [ ] 安装 NextAuth.js
- [ ] 配置认证提供商（GitHub OAuth / 邮箱）
- [ ] 实现登录页面
- [ ] 实现注册页面
- [ ] 实现登出功能
- [ ] 添加受保护路由

### 📌 Day 4 - 书签 CRUD
- [ ] API 路由：POST /api/bookmarks（创建）
- [ ] API 路由：GET /api/bookmarks（列表）
- [ ] API 路由：GET /api/bookmarks/:id（详情）
- [ ] API 路由：PUT /api/bookmarks/:id（更新）
- [ ] API 路由：DELETE /api/bookmarks/:id（删除）
- [ ] UI：书签表单
- [ ] UI：书签列表
- [ ] UI：搜索功能

### 🎨 Day 5 - UI 优化 + 部署
- [ ] 完善样式
- [ ] 响应式设计测试
- [ ] 错误处理 + 加载状态
- [ ] 部署到 Vercel
- [ ] 配置线上 PostgreSQL
