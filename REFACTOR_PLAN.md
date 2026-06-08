# SourceTree Rust 前端重构计划

## 基于 TanStack Start + Tauri 2 的全栈架构重构

---

## 一、现状分析

### 1.1 当前架构

```
sourcetree-rust/
├── src/                    # 前端（Vite + React 19 + Zustand）
│   ├── App.tsx             # 主入口，Tab 管理 + 仓库恢复逻辑
│   ├── main.tsx            # ReactDOM 挂载
│   ├── components/
│   │   ├── repo/           # 仓库页面组件（7个）
│   │   └── welcome/        # 欢迎页
│   ├── services/git.ts     # Tauri IPC 调用层（~470行，纯 invoke 封装）
│   ├── stores/index.ts     # Zustand 全局状态（Theme/Repo/Tab/Bookmark/Selection）
│   └── utils/persist.ts    # localStorage 持久化
├── src-tauri/              # Rust 后端（Tauri 2 + gix）
│   └── src/
│       ├── commands/       # Tauri 命令（6个模块，40+命令）
│       ├── services/       # Git 核心服务（gix + git CLI）
│       ├── models/         # 数据模型
│       └── state.rs        # 全局状态
└── vite.config.ts          # Vite 配置
```

### 1.2 核心问题

| 问题 | 说明 |
|------|------|
| **无路由系统** | 当前用条件渲染切换页面（`tabs.length > 0 ? <RepositoryPage /> : <WelcomePage />`），无法支持 URL 导航、深链接、浏览器前进后退 |
| **状态管理分散** | Zustand stores + 组件内 useState 混用，RepositoryPage 内 20+ 个 useState，props 逐层透传严重 |
| **IPC 层无类型安全** | `services/git.ts` 是手动编写的 invoke 封装，与 Rust 端的类型同步靠人工维护 |
| **数据获取无缓存** | 每次操作后手动 `refreshAll()`，无请求去重、无乐观更新、无后台刷新策略 |
| **组件职责过重** | RepositoryPage 超 800 行，承担数据获取、状态管理、事件处理、布局渲染全部职责 |
| **无代码分割** | 所有组件打包在一起，首屏加载全量代码 |
| **持久化原始** | 仅 localStorage，无 schema 校验、无版本迁移 |

### 1.3 可复用资产

- **Rust 后端**：完全保留，40+ Tauri 命令无需修改
- **UI 组件**：DiffPanel、SimpleDiffPanel、CommitGraph 等纯展示组件可直接迁移
- **业务逻辑**：Git 操作流程（暂存/提交/推送等）逻辑可提取为 hooks/composables
- **样式系统**：Tailwind CSS + CSS 变量主题方案可直接沿用

---

## 二、目标架构

### 2.1 技术栈选型

| 层级 | 当前 | 目标 | 理由 |
|------|------|------|------|
| 框架 | Vite + React SPA | **TanStack Start** | 类型安全路由、文件路由、SSR/SPA 可选、Server Functions |
| 路由 | 无 | **TanStack Router** | 嵌套路由、搜索参数类型安全、路由级数据加载 |
| 数据获取 | 手动 invoke + refreshAll | **TanStack Query** | 请求缓存、自动刷新、乐观更新、请求去重 |
| 状态管理 | Zustand（5个 store） | **Zustand（精简）+ TanStack Query** | 服务端状态由 Query 管理，客户端状态由 Zustand 管理 |
| IPC 层 | 手写 invoke 封装 | **类型安全封装 + TanStack Query 集成** | 编译期类型检查、自动缓存失效 |
| 构建 | Vite | **Vite（TanStack Start 内置）** | 无缝衔接 Tauri 2 |

### 2.2 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    TanStack Start (前端)                      │
│                                                              │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │  Router   │  │  TanStack    │  │  Zustand           │    │
│  │ (文件路由) │  │  Query       │  │  (客户端状态)       │    │
│  │          │  │  (服务端状态)  │  │  - theme           │    │
│  │ /welcome │  │  - repos     │  │  - ui preferences  │    │
│  │ /repo/$id│  │  - files     │  │                    │    │
│  │ /repo/$id│  │  - commits   │  └────────────────────┘    │
│  │  /history│  │  - branches  │                            │
│  └──────────┘  └──────┬───────┘                            │
│                        │                                     │
│              ┌─────────▼──────────┐                         │
│              │  IPC 适配层         │                         │
│              │  (类型安全 invoke)  │                         │
│              └─────────┬──────────┘                         │
└────────────────────────┼────────────────────────────────────┘
                         │ Tauri IPC (invoke)
┌────────────────────────┼────────────────────────────────────┐
│                   Tauri 2 (Rust 后端)                        │
│              ┌─────────▼──────────┐                         │
│              │  Commands (40+)    │                         │
│              │  - repo / status   │                         │
│              │  - branch / remote │                         │
│              │  - discard / tag   │                         │
│              └─────────┬──────────┘                         │
│              ┌─────────▼──────────┐                         │
│              │  GitService (gix)  │                         │
│              └────────────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 TanStack Start 在 Tauri 桌面应用中的定位

> **关键决策：SPA 模式而非 SSR 模式**

TanStack Start 支持 SPA 模式，这是 Tauri 桌面应用的正确选择：
- 桌面应用不需要 SEO，SSR 无意义
- Tauri WebView 通过 `tauri://localhost` 加载前端，SPA 模式更自然
- 保留 TanStack Start 的全部路由能力（类型安全、文件路由、搜索参数）
- 保留 Server Functions 能力（可用于 IPC 适配层的类型安全封装）

**TanStack Start 为本项目带来的核心能力：**

1. **类型安全文件路由**：`/welcome`、`/repo/$repoId`、`/repo/$repoId/history` 等路由自动生成类型
2. **路由级数据加载（Loader）**：进入页面前预取数据，替代手动 useEffect + refreshAll
3. **搜索参数类型安全**：`?tab=file-status&file=src/main.tsx` 等参数有完整类型推断
4. **Server Functions**：可作为 IPC 调用层的类型安全封装（`createServerFn` 替代手写 invoke）
5. **代码分割**：路由级自动代码分割，按需加载
6. **Middleware**：可用于权限校验、全局状态注入等

---

## 三、目录结构设计

```
sourcetree-rust/
├── app/                          # TanStack Start 入口
│   ├── client.tsx                # 客户端入口
│   ├── router.tsx                # 路由配置
│   └── ssr.tsx                   # SSR 入口（SPA 模式下仅占位）
│
├── src/                          # 应用源码
│   ├── routes/                   # 文件路由（TanStack Router 约定）
│   │   ├── __root.tsx            # 根布局（标题栏 + Tab 栏）
│   │   ├── index.tsx             # 首页 → 重定向到 /welcome
│   │   ├── welcome.tsx           # 欢迎页
│   │   └── repo/                 # 仓库相关路由
│   │       ├── $repoId.tsx       # 仓库布局（工具栏 + 侧边栏 + 子路由出口）
│   │       ├── $repoId.index.tsx # 默认子路由 → 文件状态
│   │       ├── $repoId.history.tsx    # 提交历史
│   │       └── $repoId.search.tsx     # 搜索
│   │
│   ├── components/               # UI 组件
│   │   ├── layout/               # 布局组件
│   │   │   ├── TitleBar.tsx      # 标题栏
│   │   │   ├── TabBar.tsx        # Tab 栏
│   │   │   ├── Sidebar.tsx       # 侧边导航栏
│   │   │   └── Toolbar.tsx       # 工具栏
│   │   ├── diff/                 # Diff 相关组件
│   │   │   ├── DiffPanel.tsx     # 分栏 Diff 视图
│   │   │   └── SimpleDiffPanel.tsx # SourceTree 风格 Diff
│   │   ├── commit/               # 提交相关组件
│   │   │   ├── CommitGraph.tsx   # DAG 提交图
│   │   │   ├── CommitDetail.tsx  # 提交详情
│   │   │   └── CommitList.tsx    # 提交列表
│   │   ├── file/                 # 文件状态组件
│   │   │   ├── FileList.tsx      # 文件列表（暂存/未暂存）
│   │   │   ├── FileStatusIcon.tsx # 状态图标
│   │   │   └── CommitInput.tsx   # 提交信息输入
│   │   ├── branch/               # 分支组件
│   │   │   ├── BranchList.tsx    # 分支列表
│   │   │   └── BranchPanel.tsx   # 分支面板
│   │   ├── tag/                  # 标签组件
│   │   │   ├── TagDialog.tsx     # 标签创建对话框
│   │   │   └── TagContextMenu.tsx # 标签右键菜单
│   │   └── common/               # 通用组件
│   │       ├── ResizablePanel.tsx # 可拖拽分隔面板
│   │       └── ContextMenu.tsx   # 右键菜单
│   │
│   ├── lib/                      # 基础设施层
│   │   ├── tauri/                # Tauri IPC 适配层
│   │   │   ├── commands.ts       # 类型安全的 invoke 封装
│   │   │   ├── types.ts          # 与 Rust 端对齐的类型定义
│   │   │   └── index.ts          # 统一导出
│   │   ├── queries/              # TanStack Query 查询定义
│   │   │   ├── repo.ts           # 仓库相关查询
│   │   │   ├── status.ts         # 文件状态查询
│   │   │   ├── commit.ts         # 提交历史查询
│   │   │   ├── branch.ts         # 分支查询
│   │   │   └── remote.ts         # 远程操作查询
│   │   └── persistence/          # 持久化层
│   │       ├── bookmarks.ts      # 书签持久化
│   │       ├── tabs.ts           # Tab 状态持久化
│   │       └── schema.ts         # 数据 schema 与版本迁移
│   │
│   ├── stores/                   # Zustand 客户端状态
│   │   ├── theme.ts              # 主题状态
│   │   └── ui.ts                 # UI 偏好状态
│   │
│   ├── hooks/                    # 自定义 Hooks
│   │   ├── useRepo.ts            # 仓库操作 hook
│   │   ├── useFileActions.ts     # 文件操作 hook（暂存/丢弃/行选择）
│   │   ├── useCommitActions.ts   # 提交操作 hook
│   │   └── useAutoRefresh.ts     # 自动刷新 hook
│   │
│   └── styles/                   # 样式
│       ├── globals.css           # 全局样式 + CSS 变量
│       └── themes/               # 主题定义
│
├── src-tauri/                    # Rust 后端（保持不变）
│
├── app.config.ts                 # TanStack Start 配置
├── vite.config.ts                # Vite 配置（TanStack Start 插件）
├── tsconfig.json
├── tailwind.config.js
└── package.json
```

---

## 四、核心模块重构方案

### 4.1 路由系统

**当前问题**：无路由，条件渲染切换页面

**方案**：TanStack Router 文件路由

```
路由结构：
/                          → 重定向到 /welcome
/welcome                   → 欢迎页（书签管理 + 打开仓库）
/repo/$repoId              → 仓库布局（工具栏 + 侧边栏 + 子路由出口）
/repo/$repoId/             → 文件状态（默认子路由）
/repo/$repoId/history      → 提交历史
/repo/$repoId/search       → 搜索
```

**路由级数据加载示例**：

```typescript
// src/routes/repo/$repoId.tsx
import { createFileRoute } from '@tanstack/react-router'
import { repoQueries } from '@/lib/queries/repo'

export const Route = createFileRoute('/repo/$repoId')({
  loader: async ({ params }) => {
    // 进入页面前预取数据
    const [summary, branches, tracking] = await Promise.all([
      queryClient.ensureQueryData(repoQueries.summary(params.repoId)),
      queryClient.ensureQueryData(repoQueries.branches(params.repoId)),
      queryClient.ensureQueryData(repoQueries.tracking(params.repoId)),
    ])
    return { summary, branches, tracking }
  },
  component: RepoLayout,
})
```

**搜索参数类型安全**：

```typescript
// /repo/$repoId?tab=history&commit=abc123
const search = useSearch({ strict: false }) // { tab?: 'file-status' | 'history' | 'search', commit?: string }
```

### 4.2 IPC 适配层

**当前问题**：`services/git.ts` 是 470 行的手写 invoke 封装，类型靠人工维护

**方案**：类型安全封装 + TanStack Query 集成

```typescript
// src/lib/tauri/types.ts — 与 Rust 端对齐的类型定义
export interface FileStatus {
  path: string
  worktree_status: string | null
  stage_status: string | null
  is_untracked: boolean
  is_ignored: boolean
}

// src/lib/tauri/commands.ts — 类型安全的 invoke 封装
import { invoke } from '@tauri-apps/api/core'
import type { FileStatus, RepoSummary, CommitEntry } from './types'

export const tauriCommands = {
  getStatus: (repoPath: string) =>
    invoke<FileStatus[]>('get_status', { repoPath }),

  getRepoSummary: (repoPath: string) =>
    invoke<RepoSummary>('get_repo_summary', { repoPath }),

  stageFiles: (repoPath: string, paths: string[]) =>
    invoke<string>('stage_files', { repoPath, paths }),

  // ... 其余命令
} as const
```

### 4.3 数据获取层（TanStack Query）

**当前问题**：手动 `refreshAll()` 刷新所有数据，无缓存、无去重、无乐观更新

**方案**：TanStack Query 管理所有服务端状态

```typescript
// src/lib/queries/status.ts
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { tauriCommands } from '@/lib/tauri/commands'

// 查询定义
export const statusQueries = {
  all: (repoPath: string) => queryOptions({
    queryKey: ['repo', repoPath, 'status'],
    queryFn: () => tauriCommands.getStatus(repoPath),
    refetchInterval: 30_000, // 30秒自动刷新
  }),

  summary: (repoPath: string) => queryOptions({
    queryKey: ['repo', repoPath, 'summary'],
    queryFn: () => tauriCommands.getRepoSummary(repoPath),
    refetchInterval: 60_000,
  }),
}

// 变更操作（带缓存失效）
export function useStageFiles(repoPath: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (paths: string[]) => tauriCommands.stageFiles(repoPath, paths),
    onSuccess: () => {
      // 暂存成功后，失效相关查询以触发重新获取
      queryClient.invalidateQueries({ queryKey: ['repo', repoPath, 'status'] })
      queryClient.invalidateQueries({ queryKey: ['repo', repoPath, 'summary'] })
    },
  })
}

// 乐观更新示例
export function useStageFileOptimistic(repoPath: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (path: string) => tauriCommands.stageFiles(repoPath, [path]),
    onMutate: async (path) => {
      await queryClient.cancelQueries({ queryKey: ['repo', repoPath, 'status'] })
      const previous = queryClient.getQueryData(['repo', repoPath, 'status'])
      // 乐观更新：立即将文件从未暂存移到已暂存
      queryClient.setQueryData(['repo', repoPath, 'status'], (old: FileStatus[]) =>
        old.map(f => f.path === path ? { ...f, stage_status: f.worktree_status, worktree_status: null } : f)
      )
      return { previous }
    },
    onError: (_err, _path, context) => {
      // 回滚
      queryClient.setQueryData(['repo', repoPath, 'status'], context?.previous)
    },
  })
}
```

### 4.4 状态管理分层

**原则**：服务端状态归 Query，客户端状态归 Zustand

| 状态类型 | 管理方式 | 示例 |
|----------|----------|------|
| 服务端数据 | TanStack Query | 文件列表、提交历史、分支列表、仓库摘要 |
| 操作结果 | TanStack Mutation | 暂存/取消暂存/提交/推送/拉取 |
| UI 状态 | Zustand | 主题、侧边栏展开/收起、当前选中文件 |
| 持久化状态 | Zustand + 存储层 | 书签、Tab 列表、UI 偏好 |

**精简后的 Zustand Store**：

```typescript
// src/stores/theme.ts
interface ThemeState {
  theme: 'light' | 'dark'
  toggleTheme: () => void
}

// src/stores/ui.ts
interface UiState {
  sidebarCollapsed: boolean
  activeWorkspaceTab: 'file-status' | 'history' | 'search'
  // ... 纯 UI 状态
}
```

### 4.5 组件拆分策略

**当前问题**：RepositoryPage 800+ 行，承担全部职责

**方案**：按路由 + 职责拆分

```
RepositoryPage (800行)
  ├── 拆分为路由布局 → routes/repo/$repoId.tsx (~100行)
  ├── 工具栏 → components/layout/Toolbar.tsx (~80行)
  ├── 侧边栏 → components/layout/Sidebar.tsx (~150行)
  ├── 文件状态页 → routes/repo/$repoId.index.tsx (~200行)
  ├── 历史页 → routes/repo/$repoId.history.tsx (~200行)
  └── 数据逻辑 → hooks/ + queries/ (0 UI 代码)
```

### 4.6 持久化层升级

**当前问题**：裸 localStorage，无 schema 校验、无版本迁移

**方案**：带 schema 校验和版本迁移的持久化层

```typescript
// src/lib/persistence/schema.ts
import { z } from 'zod'

const BookmarkSchema = z.object({
  name: z.string(),
  path: z.string(),
})

const TabSchema = z.object({
  path: z.string(),
  branch: z.string(),
})

// 版本化存储
const STORAGE_VERSION = 2

const AppStateSchema = z.object({
  version: z.literal(STORAGE_VERSION),
  bookmarks: z.array(BookmarkSchema),
  tabs: z.array(TabSchema),
  activeTabId: z.string().nullable(),
  theme: z.enum(['light', 'dark']),
})

// 迁移函数
function migrate(raw: unknown): z.infer<typeof AppStateSchema> {
  // v1 → v2 迁移逻辑
  // ...
}
```

---

## 五、TanStack Start 与 Tauri 2 协作要点

### 5.1 构建配置

```typescript
// vite.config.ts
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [
    tanstackStart({ srcDirectory: 'src' }),
    viteReact(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
})
```

```json
// tauri.conf.json（构建配置调整）
{
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build"
  }
}
```

### 5.2 SPA 模式配置

TanStack Start 在 Tauri 桌面应用中使用 SPA 模式：

```typescript
// app.config.ts
export default {
  // 启用 SPA 模式（不需要 SSR）
  spa: true,
}
```

### 5.3 Server Functions 与 Tauri IPC 的关系

> **重要决策：Server Functions 不替代 Tauri IPC，而是作为可选的中间层**

在 Tauri 桌面应用中：
- **Tauri IPC（invoke）** 是与 Rust 后端通信的唯一通道，必须保留
- **Server Functions** 在 SPA 模式下运行在客户端，可以封装 IPC 调用提供类型安全接口
- 两者关系：Server Functions → 内部调用 invoke → Rust 后端

```typescript
// 可选方案：用 Server Functions 封装 IPC
import { createServerFn } from '@tanstack/react-start'
import { invoke } from '@tauri-apps/api/core'

export const getRepoStatus = createServerFn({ method: 'GET' })
  .validator((data: { repoPath: string }) => data)
  .handler(async ({ data }) => {
    return invoke<FileStatus[]>('get_status', { repoPath: data.repoPath })
  })
```

> **推荐方案**：直接使用 TanStack Query + 类型安全的 invoke 封装，更简洁直观。Server Functions 作为后续需要时的扩展点。

### 5.4 开发模式与生产模式

| 模式 | 前端 | 后端 | 通信方式 |
|------|------|------|----------|
| 开发 | Vite dev server (localhost:1420) | Tauri 窗口 | HTTP + IPC |
| 生产 | 构建产物嵌入 Tauri | Tauri 窗口 | tauri:// + IPC |

---

## 六、重构步骤（分阶段）

### 阶段一：基础设施搭建（不改变现有功能）

**目标**：引入 TanStack Start + Router + Query，建立新架构骨架

1. **安装依赖**
   ```bash
   pnpm add @tanstack/react-router @tanstack/react-start @tanstack/react-query
   pnpm add -D @tanstack/router-devtools @tanstack/query-devtools
   ```

2. **配置 TanStack Start**
   - 修改 `vite.config.ts`，添加 `tanstackStart` 插件
   - 创建 `app/` 目录结构（client.tsx、router.tsx）
   - 配置 SPA 模式

3. **建立文件路由骨架**
   - 创建 `src/routes/` 目录
   - 实现 `__root.tsx`（根布局，含标题栏 + Tab 栏）
   - 实现 `index.tsx`（重定向到 /welcome）
   - 实现 `welcome.tsx`（迁移 WelcomePage）
   - 实现 `repo/$repoId.tsx`（仓库布局）
   - 实现 `repo/$repoId.index.tsx`（文件状态）
   - 实现 `repo/$repoId.history.tsx`（提交历史）
   - 实现 `repo/$repoId.search.tsx`（搜索）

4. **建立 IPC 适配层**
   - 创建 `src/lib/tauri/` 目录
   - 迁移 `services/git.ts` → `lib/tauri/commands.ts` + `lib/tauri/types.ts`

5. **建立 Query 层**
   - 创建 `src/lib/queries/` 目录
   - 定义 repo/status/commit/branch/remote 查询

6. **验证**：确保所有页面可通过路由访问，Tauri IPC 正常工作

### 阶段二：状态管理迁移

**目标**：将服务端状态从 Zustand 迁移到 TanStack Query

1. **精简 Zustand Store**
   - 保留 `theme.ts`（主题状态）
   - 保留 `ui.ts`（UI 偏好状态）
   - 移除 `useRepoStore`、`useSelectionStore`（由 Query + 路由参数替代）
   - 保留 `useTabStore`、`useBookmarkStore`（客户端持久化状态）

2. **迁移数据获取逻辑**
   - RepositoryPage 中的 `refreshAll()` → TanStack Query 自动刷新
   - 文件状态查询 → `statusQueries.all()`
   - 提交历史查询 → `commitQueries.recent()`
   - 分支查询 → `branchQueries.list()`

3. **迁移变更操作**
   - `handleStage` → `useStageFiles` mutation
   - `handleCommit` → `useCommitChanges` mutation
   - `handlePush/Pull/Fetch` → 对应 mutation

4. **验证**：所有操作功能正常，数据刷新策略正确

### 阶段三：组件拆分与优化

**目标**：拆分大组件，提取可复用逻辑

1. **拆分 RepositoryPage**
   - 提取 `Toolbar.tsx`（工具栏）
   - 提取 `Sidebar.tsx`（侧边导航）
   - 提取 `CommitInput.tsx`（提交信息区域）
   - 提取 `BranchPanel.tsx`（分支面板）

2. **提取自定义 Hooks**
   - `useFileActions()`（暂存/取消暂存/丢弃/hunk 操作）
   - `useCommitActions()`（提交/查看详情/加载更多）
   - `useAutoRefresh()`（窗口焦点刷新、定时 fetch）

3. **优化 Diff 组件**
   - DiffPanel、SimpleDiffPanel 保持不变
   - CommitGraph 保持不变
   - FileStatusPage 拆分为 FileList + CommitInput

4. **验证**：所有 UI 功能正常，无视觉回归

### 阶段四：持久化与体验优化

**目标**：升级持久化层，优化用户体验

1. **持久化层升级**
   - 引入 zod schema 校验
   - 实现版本迁移机制
   - Tab 状态与路由同步（URL 即状态）

2. **体验优化**
   - 乐观更新（暂存/取消暂存操作即时反馈）
   - 骨架屏加载状态
   - 错误边界与重试
   - 键盘快捷键（通过 TanStack Router 的导航 API）

3. **性能优化**
   - 路由级代码分割（自动）
   - Query 缓存策略调优
   - 虚拟滚动（大文件列表/长提交历史）

4. **验证**：完整功能测试，性能基准对比

### 阶段五：清理与收尾

**目标**：移除旧代码，完善文档

1. **移除旧代码**
   - 删除 `src/App.tsx`（由路由系统替代）
   - 删除 `src/main.tsx`（由 `app/client.tsx` 替代）
   - 删除 `src/services/git.ts`（由 `lib/tauri/` 替代）
   - 删除 `src/stores/index.ts`（由拆分后的 store 替代）
   - 删除 `src/utils/persist.ts`（由 `lib/persistence/` 替代）

2. **清理依赖**
   - 移除不再需要的包
   - 更新 `package.json` scripts

3. **最终验证**
   - 完整功能回归测试
   - Tauri 打包构建测试
   - 多仓库 Tab 切换测试

---

## 七、风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| TanStack Start RC 稳定性 | API 可能在 1.0 前变化 | 锁定版本，关注 changelog |
| SPA 模式下 Server Functions 限制 | 部分功能可能不可用 | 直接使用 IPC + Query，不依赖 Server Functions |
| Tauri WebView 兼容性 | 不同 OS 的 WebView 行为差异 | 保持现有兼容性处理，增量测试 |
| 重构期间功能不可用 | 开发周期内无法使用 | 分阶段重构，每阶段保持可用 |
| TanStack Query 学习曲线 | 团队需要适应新范式 | 先在非核心模块试点 |

---

## 八、依赖清单

### 新增依赖

```json
{
  "dependencies": {
    "@tanstack/react-router": "^1.169",
    "@tanstack/react-start": "^1.167",
    "@tanstack/react-query": "^5",
    "zod": "^3"
  },
  "devDependencies": {
    "@tanstack/router-devtools": "^1.169",
    "@tanstack/query-devtools": "^5"
  }
}
```

### 可移除依赖

- 无需移除，现有依赖（zustand、lucide-react 等）继续使用

### 保留依赖

```json
{
  "@tauri-apps/api": "^2",
  "@tauri-apps/plugin-dialog": "^2.7.1",
  "@tauri-apps/plugin-shell": "^2",
  "@gitgraph/react": "^1.6.0",
  "lucide-react": "^0.487.0",
  "react": "^19",
  "react-dom": "^19",
  "react-diff-view": "^3.3.3",
  "react-resizable-panels": "^2",
  "zustand": "^5"
}
```

---

## 九、验收标准

1. **路由系统**：所有页面可通过 URL 直接访问，支持前进后退
2. **数据获取**：所有服务端数据通过 TanStack Query 管理，无手动 refreshAll
3. **类型安全**：路由参数、搜索参数、IPC 调用均有编译期类型检查
4. **代码分割**：首屏仅加载当前路由代码
5. **乐观更新**：暂存/取消暂存操作即时反馈
6. **功能完整**：所有现有功能正常工作，无功能回归
7. **Tauri 打包**：开发模式和生产构建均正常
