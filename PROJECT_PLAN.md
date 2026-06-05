# SourceTree-Rust 项目规划文档

> 使用 Tauri2 + React + gix 重构 SourceTree Git GUI 客户端

---

## 一、SourceTree 完整功能表

### 1.1 仓库管理

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 克隆仓库 | 支持 HTTPS/SSH/本地路径克隆 | P0 |
| 初始化仓库 | 创建新 Git 仓库 | P0 |
| 打开本地仓库 | 浏览并打开已有仓库 | P0 |
| 仓库书签 | 管理常用仓库列表，快速切换 | P0 |
| 远程仓库管理 | 添加/编辑/删除远程仓库地址 | P1 |
| 仓库设置 | 编辑 .git/config 配置 | P2 |
| 裸仓库支持 | 打开和管理 bare 仓库 | P2 |

### 1.2 文件状态与暂存

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 文件状态视图 | 显示未暂存/已暂存/未跟踪文件 | P0 |
| 按文件暂存 | 整个文件 stage/unstage | P0 |
| 按 Hunk 暂存 | 按 diff hunk 级别 stage/unstage | P1 |
| 按行暂存 | 按单行级别 stage/unstage | P1 |
| 丢弃更改 | 丢弃单个文件/hunk/行的修改 | P1 |
| 忽略文件 | 添加到 .gitignore | P1 |
| 假设未更改 | git update-index --assume-unchanged | P2 |

### 1.3 提交管理

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 提交更改 | 填写提交信息并提交 | P0 |
| 修改上次提交 | --amend 修改最近一次提交 | P1 |
| 签名提交 | GPG 签名提交 | P2 |
| 提交模板 | 预设提交信息模板 | P2 |
| 提交历史浏览 | 查看完整提交日志 | P0 |
| 提交详情 | 查看单次提交的文件变更和差异 | P0 |
| 提交搜索 | 按消息/作者/SHA/文件搜索提交 | P1 |

### 1.4 分支管理

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 创建分支 | 从指定提交创建新分支 | P0 |
| 切换分支 | Checkout 到目标分支 | P0 |
| 删除分支 | 删除本地/远程分支 | P0 |
| 重命名分支 | 修改分支名称 | P1 |
| 分支列表 | 查看所有本地/远程分支 | P0 |
| 分支对比 | 比较两个分支的差异 | P1 |
| 分支跟踪 | 设置上游跟踪分支 | P1 |

### 1.5 合并与变基

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 合并分支 | 将指定分支合并到当前分支 | P0 |
| 变基(Rebase) | 将当前分支变基到目标分支 | P1 |
| 交互式变基 | Squash/Rearrange/Edit/删除提交 | P1 |
| Cherry-pick | 将指定提交应用到当前分支 | P1 |
| 冲突解决 | 可视化冲突标记，手动解决冲突 | P0 |
| 中止合并/变基 | 取消进行中的合并或变基操作 | P1 |

### 1.6 远程同步

| 功能 | 说明 | 优先级 |
|------|------|--------|
| Fetch | 获取远程更新，不合并 | P0 |
| Pull | 拉取并合并远程更新 | P0 |
| Push | 推送本地提交到远程 | P0 |
| 强制推送 | --force 推送 | P2 |
| 领先/落后指示 | 显示与远程分支的差异数量 | P1 |
| Pull Request | 创建/查看 Pull Request | P2 |

### 1.7 Stash 管理

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 创建 Stash | 暂存当前工作区修改 | P1 |
| 应用 Stash | 恢复暂存的修改 | P1 |
| 弹出 Stash | 应用并删除 Stash | P1 |
| 删除 Stash | 删除指定 Stash | P1 |
| Stash 列表 | 查看所有 Stash 条目 | P1 |
| 部分 Stash | 仅暂存部分文件 | P2 |

### 1.8 标签管理

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 创建标签 | 轻量标签/附注标签 | P1 |
| 删除标签 | 删除本地/远程标签 | P1 |
| 推送标签 | 将标签推送到远程 | P1 |
| 标签列表 | 查看所有标签 | P1 |

### 1.9 差异查看

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 文件差异对比 | Side-by-side / Unified 视图 | P0 |
| 提交间差异 | 比较任意两次提交的差异 | P1 |
| 分支间差异 | 比较两个分支的差异 | P1 |
| 行内差异高亮 | 精确到行级别的变更高亮 | P1 |
| 图片差异 | 对比图片文件变更 | P2 |
| 二进制文件信息 | 显示二进制文件变更摘要 | P2 |

### 1.10 提交图可视化

| 功能 | 说明 | 优先级 |
|------|------|--------|
| DAG 图 | 提交历史有向无环图可视化 | P0 |
| 分支颜色区分 | 不同分支使用不同颜色 | P0 |
| 合并节点标记 | 标记合并提交 | P1 |
| 图交互 | 点击节点查看详情 | P0 |
| 图过滤 | 按分支/作者/日期过滤 | P1 |

### 1.11 子模块

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 添加子模块 | git submodule add | P2 |
| 更新子模块 | git submodule update | P2 |
| 初始化子模块 | git submodule init | P2 |
| 子模块状态 | 查看子模块当前状态 | P2 |

### 1.12 Git-flow

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 初始化 Git-flow | 配置 Git-flow 分支模型 | P2 |
| Start Feature | 创建功能分支 | P2 |
| Finish Feature | 完成功能分支 | P2 |
| Start Release | 创建发布分支 | P2 |
| Finish Release | 完成发布分支 | P2 |
| Start Hotfix | 创建热修复分支 | P2 |
| Finish Hotfix | 完成热修复分支 | P2 |

### 1.13 其他功能

| 功能 | 说明 | 优先级 |
|------|------|--------|
| Git LFS 支持 | 大文件存储管理 | P2 |
| Blame 视图 | 查看文件每行的修改者 | P1 |
| Reset | Soft/Mixed/Hard 重置 | P1 |
| Revert | 撤销指定提交 | P1 |
| Bisect | 二分法查找问题提交 | P2 |
| 内置终端 | 集成命令行终端 | P2 |
| SSH 密钥管理 | 生成/导入/管理 SSH 密钥 | P1 |
| 自定义快捷键 | 用户自定义键盘快捷键 | P2 |
| 深色主题 | 暗色模式支持 | P1 |
| 多语言支持 | 国际化 i18n | P2 |
| 拖放操作 | 拖放文件/分支操作 | P2 |
| 外部差异工具 | 集成 Beyond Compare 等工具 | P2 |
| 通知系统 | 操作结果通知提示 | P1 |

---

## 二、项目架构设计

### 2.1 整体架构：模块化单体

```
┌─────────────────────────────────────────────────┐
│                  Tauri2 应用壳                    │
├──────────────────────┬──────────────────────────┤
│   前端 (React + TS)  │   后端 (Rust + gix)     │
│                      │                          │
│  ┌──────────────┐   │  ┌──────────────────┐    │
│  │ UI 组件层     │   │  │ Tauri Commands    │    │
│  │ (Pages/Views) │   │  │ (IPC 接口层)      │    │
│  └──────┬───────┘   │  └────────┬─────────┘    │
│         │           │           │              │
│  ┌──────┴───────┐   │  ┌────────┴─────────┐    │
│  │ 状态管理层    │   │  │ Git 服务层        │    │
│  │ (Zustand)    │◄──┤  │ (业务逻辑)        │    │
│  └──────┬───────┘   │  └────────┬─────────┘    │
│         │           │           │              │
│  ┌──────┴───────┐   │  ┌────────┴─────────┐    │
│  │ 服务调用层    │   │  │ Git 操作层        │    │
│  │ (Tauri IPC)  │──►│  │ (gix 封装)        │    │
│  └──────────────┘   │  └──────────────────┘    │
│                      │                          │
│  ┌──────────────┐   │  ┌──────────────────┐    │
│  │ 主题/样式     │   │  │ 文件系统/配置     │    │
│  │ (Tailwind)   │   │  │ (持久化层)        │    │
│  └──────────────┘   │  └──────────────────┘    │
└──────────────────────┴──────────────────────────┘
```

### 2.2 前端模块划分

```
src/
├── app/                    # 应用入口与路由
│   ├── App.tsx
│   ├── routes.tsx
│   └── layout/
├── pages/                  # 页面组件
│   ├── bookmarks/          # 仓库书签页
│   ├── repository/         # 仓库主页
│   ├── settings/           # 设置页
│   └── welcome/            # 欢迎页
├── features/               # 功能模块（按领域划分）
│   ├── commit/             # 提交相关
│   ├── branch/             # 分支管理
│   ├── diff/               # 差异查看
│   ├── history/            # 提交历史与图
│   ├── stash/              # Stash 管理
│   ├── remote/             # 远程同步
│   ├── merge/              # 合并与变基
│   ├── tag/                # 标签管理
│   └── submodule/          # 子模块
├── components/             # 通用 UI 组件
│   ├── tree/               # 树形组件
│   ├── graph/              # 提交图组件
│   ├── diff-viewer/        # 差异查看器
│   ├── file-list/          # 文件列表
│   ├── modal/              # 弹窗
│   └── toolbar/            # 工具栏
├── services/               # Tauri IPC 调用层
│   ├── git.ts              # Git 操作接口
│   ├── repo.ts             # 仓库操作接口
│   └── config.ts           # 配置操作接口
├── stores/                 # Zustand 状态管理
│   ├── repo-store.ts       # 仓库状态
│   ├── ui-store.ts         # UI 状态
│   └── settings-store.ts   # 设置状态
├── hooks/                  # 自定义 Hooks
├── types/                  # TypeScript 类型定义
├── utils/                  # 工具函数
└── i18n/                   # 国际化
```

### 2.3 后端模块划分

```
src-tauri/src/
├── main.rs                 # 桌面入口
├── lib.rs                  # 应用初始化与命令注册
├── commands/               # Tauri 命令（IPC 接口）
│   ├── mod.rs
│   ├── repo.rs             # 仓库操作命令
│   ├── commit.rs           # 提交操作命令
│   ├── branch.rs           # 分支操作命令
│   ├── remote.rs           # 远程操作命令
│   ├── diff.rs             # 差异操作命令
│   ├── stash.rs            # Stash 操作命令
│   ├── tag.rs              # 标签操作命令
│   ├── merge.rs            # 合并/变基命令
│   └── config.rs           # 配置操作命令
├── services/               # 业务逻辑层
│   ├── mod.rs
│   ├── git_service.rs      # Git 核心服务（gix 封装）
│   ├── repo_service.rs     # 仓库管理服务
│   ├── diff_service.rs     # 差异计算服务
│   ├── merge_service.rs    # 合并冲突服务
│   └── remote_service.rs   # 远程交互服务
├── models/                 # 数据模型
│   ├── mod.rs
│   ├── commit.rs           # 提交模型
│   ├── branch.rs           # 分支模型
│   ├── diff.rs             # 差异模型
│   ├── remote.rs           # 远程模型
│   └── config.rs           # 配置模型
├── state.rs                # 应用状态管理
└── error.rs                # 统一错误处理
```

### 2.4 技术选型明细

| 层次 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Tauri 2.x | 轻量级跨平台桌面应用框架 |
| 前端框架 | React 19 + TypeScript | UI 构建 |
| 状态管理 | Zustand | 轻量级状态管理 |
| 样式方案 | Tailwind CSS 4 | 原子化 CSS |
| UI 组件库 | shadcn/ui | 可定制的高质量组件 |
| 图表渲染 | @antv/g6 或 D3.js | 提交图 DAG 可视化 |
| 差异渲染 | Monaco Editor | 代码差异查看（复用 VSCode 引擎） |
| 构建工具 | Vite | 前端构建 |
| Git 操作 | gix (gitoxide) | 纯 Rust Git 实现，跨平台优化，零 C 依赖 |
| 数据持久化 | sled 或 SQLite | 本地配置与缓存存储 |
| IPC 通信 | Tauri Commands + Events | 前后端通信 |

### 2.5 两种架构方案对比

#### 方案 A：纯 gix 方案

- **描述**：所有 Git 操作通过 gix (gitoxide) 纯 Rust 库完成
- **优点**：
  - 纯 Rust 实现，零 C 依赖，跨平台编译无障碍
  - 不依赖系统 Git 安装，独立运行
  - 性能优异：零拷贝解析、并行 pack 处理、LRU 对象缓存
  - 类型安全，内存安全，无 UB 风险（git2 曾有 RUSTSEC 漏洞）
  - 模块化 crate 设计，可按需引入子 crate
  - 已被 Cargo 自身用于依赖拉取，生产级验证
  - 原生支持：clone/fetch/push/merge/blame/rebase/reset/status/diff 等
- **缺点**：
  - 部分 porcelain 操作（如 interactive rebase UI 流程）需自行编排
  - LFS 等扩展功能需要额外处理
  - API 仍在快速迭代（部分子 crate 未到 1.0）
  - 社区文档和示例相对 git2 较少

#### 方案 B：gix + Git CLI 混合方案

- **描述**：核心操作用 gix，高级操作回退到 Git CLI
- **优点**：
  - 覆盖所有 Git 功能，无功能盲区
  - 交互式变基、LFS、子模块等直接用 CLI 实现
  - 开发效率高，复杂操作无需从底层实现
  - 可渐进式迁移：先用 CLI 实现，逐步替换为 gix
- **缺点**：
  - 依赖系统安装 Git
  - CLI 调用需要解析文本输出，不够健壮
  - 两种方式并存，需统一错误处理

#### 决策：采用方案 B（gix + Git CLI 混合方案）

理由：
1. 功能完整性优先——SourceTree 重构必须覆盖全部功能
2. gix 跨平台优势——纯 Rust 无 C 依赖，Windows/macOS/Linux 编译零障碍
3. 渐进式开发——先用 CLI 快速实现，后续逐步替换为 gix 原生 API
4. 实际可行性——interactive rebase、LFS 等用纯 gix 实现成本过高
5. 性能保障——gix 核心操作（clone/fetch/status/diff）已超越 C git，用于高频操作

---

## 三、开发阶段规划

### 阶段 0：项目基础搭建

**目标**：建立项目骨架，跑通 Tauri2 + React 开发流程

- [x] 初始化 Tauri2 + React + TypeScript 项目
- [x] 配置 Vite 构建流程
- [x] 集成 Tailwind CSS + shadcn/ui 颜色体系
- [x] 配置 Zustand 状态管理（theme/repo 双 store）
- [x] 搭建 Rust 后端模块骨架（commands/services/models/state/error）
- [x] 配置 gix 依赖（features: async-network-client, blocking-network-client）
- [x] 实现基础 IPC 通信示例（greet/get_gix_version/get_repo_info/open_repo）
- [x] 实现深色/浅色主题切换
- [x] 配置 Tauri 2 权限系统（capabilities）
- [ ] 配置 CI/CD 基础流程（待后续

**交付物**：可运行的空壳应用，前后端通信正常

---

### 阶段 1：仓库管理核心

**目标**：实现仓库打开、浏览、文件状态查看的基本流程

- [ ] 仓库书签页面（添加/删除/打开仓库）
- [ ] 打开本地仓库（gix::Repository::open）
- [ ] 仓库主页布局（三栏：侧边栏 + 文件列表 + 差异面板）
- [ ] 文件状态视图（未暂存/已暂存/未跟踪/忽略）
- [ ] 基础差异查看（unified diff 视图）
- [ ] 暂存操作（stage/unstage 文件）
- [ ] 提交功能（填写信息 + commit）
- [ ] 仓库信息面板（当前分支、远程地址等）

**交付物**：可以打开仓库、查看状态、暂存文件、提交更改

---

### 阶段 2：提交历史与分支

**目标**：实现提交历史可视化和分支管理

- [ ] 提交历史列表（分页加载）
- [ ] 提交图 DAG 可视化（分支着色）
- [ ] 提交详情面板（变更文件列表 + 差异）
- [ ] 创建/切换/删除分支
- [ ] 分支列表（本地/远程分组）
- [ ] Fetch / Pull / Push 操作
- [ ] 领先/落后远程分支指示
- [ ] 远程仓库管理（添加/编辑/删除 remote）
- [ ] 克隆仓库功能
- [ ] 初始化仓库功能

**交付物**：完整的提交历史浏览和分支管理功能

---

### 阶段 3：高级 Git 操作

**目标**：实现合并、变基、Stash 等高级操作

- [ ] 合并分支（含冲突检测）
- [ ] 变基（Rebase）
- [ ] 交互式变基（Interactive Rebase）
- [ ] Cherry-pick
- [ ] 冲突解决界面（三栏对比 + 手动编辑）
- [ ] Stash 创建/应用/弹出/删除
- [ ] 标签创建/删除/推送
- [ ] Reset（Soft/Mixed/Hard）
- [ ] Revert 提交
- [ ] 修改上次提交（Amend）
- [ ] 按 Hunk/行级别暂存
- [ ] 丢弃更改（文件/hunk/行）

**交付物**：覆盖 SourceTree 核心高级操作

---

### 阶段 4：搜索与增强

**目标**：搜索功能、Blame、外部工具集成

- [ ] 提交搜索（按消息/作者/SHA/文件）
- [ ] Blame 视图
- [ ] Side-by-side 差异视图
- [ ] 图片差异对比
- [ ] 外部差异工具集成（Beyond Compare 等）
- [ ] 内置终端（可选）
- [ ] SSH 密钥管理
- [ ] Git LFS 支持
- [ ] 子模块管理
- [ ] Git-flow 工作流支持
- [ ] 自定义快捷键
- [ ] 拖放操作支持

**交付物**：功能完整的 Git GUI 客户端

---

### 阶段 5：打磨与发布

**目标**：性能优化、稳定性、打包发布

- [ ] 大型仓库性能优化（虚拟滚动、增量加载）
- [ ] 操作通知与错误提示完善
- [ ] 国际化（中/英）
- [ ] 应用打包与自动更新
- [ ] 多平台测试（Windows / macOS / Linux）
- [ ] 用户文档
- [ ] 内存泄漏与性能分析
- [ ] 无障碍访问支持

**交付物**：可发布的稳定版本

---

## 四、关键目录结构

```
sourcetree-rust/
├── src/                          # 前端源码
│   ├── app/                      # 应用入口
│   ├── pages/                    # 页面
│   ├── features/                 # 功能模块
│   ├── components/               # 通用组件
│   ├── services/                 # IPC 调用层
│   ├── stores/                   # 状态管理
│   ├── hooks/                    # 自定义 Hooks
│   ├── types/                    # 类型定义
│   ├── utils/                    # 工具函数
│   ├── i18n/                     # 国际化
│   ├── assets/                   # 静态资源
│   ├── index.tsx                 # 入口
│   └── styles.css                # 全局样式
├── src-tauri/                    # 后端源码
│   ├── src/
│   │   ├── main.rs               # 桌面入口
│   │   ├── lib.rs                # 应用初始化
│   │   ├── commands/             # Tauri 命令
│   │   ├── services/             # 业务逻辑
│   │   ├── models/               # 数据模型
│   │   ├── state.rs              # 应用状态
│   │   └── error.rs              # 错误处理
│   ├── Cargo.toml                # Rust 依赖
│   ├── tauri.conf.json           # Tauri 配置
│   ├── capabilities/             # 权限配置
│   ├── icons/                    # 应用图标
│   └── build.rs                  # 构建脚本
├── package.json                  # Node 依赖
├── tsconfig.json                 # TS 配置
├── vite.config.ts                # Vite 配置
├── tailwind.config.ts            # Tailwind 配置
├── PROJECT_PLAN.md               # 本文档
└── .gitignore
```

---

## 五、核心依赖清单

### 前端

| 包名 | 用途 |
|------|------|
| react, react-dom | UI 框架 |
| @tauri-apps/api, @tauri-apps/plugin-* | Tauri 前端 API |
| zustand | 状态管理 |
| tailwindcss | 样式 |
| react-router-dom | 路由 |
| i18next | 国际化 |
| lucide-react | 图标 |

### 前端功能组件库选型（按功能域）

#### 基础 UI 层

| 功能域 | 组件库 | 说明 |
|--------|--------|------|
| 通用 UI 组件 | **shadcn/ui** | 按钮、输入框、对话框、下拉菜单、右键菜单(ContextMenu)、标签页(Tabs)、工具提示(Tooltip)、Toast 通知、Command 面板等。基于 Radix UI 原语，完全可定制，与 Tailwind 深度集成 |
| 可调整面板 | **react-resizable-panels** | 三栏布局（侧边栏 + 文件列表 + 差异面板），支持拖拽调整、折叠、持久化布局。shadcn/ui 的 Resizable 组件即基于此库 |
| 图标 | **lucide-react** | 轻量级 SVG 图标库，shadcn/ui 默认图标方案 |

#### 提交图可视化

| 功能域 | 组件库 | 说明 |
|--------|--------|------|
| DAG 提交图 | **@gitgraph/react** | 专为 Git 提交图设计的 React 组件，支持分支着色、合并节点、多种模板(metro/blackarrow)、水平/垂直方向、交互事件。轻量专注，API 简洁 |
| 大规模图渲染备选 | **@antv/g6** | 若 @gitgraph/react 在超大型仓库(10万+提交)下性能不足，可切换至 G6 图可视化引擎，支持 Canvas/WebGL 渲染、虚拟滚动、布局算法 |

#### 差异查看

| 功能域 | 组件库 | 说明 |
|--------|--------|------|
| Git Diff 渲染 | **react-diff-view** | 专为 Git unified diff 输出设计的 React 组件。支持 Split/Unified 双视图、Hunk 折叠与展开、行级装饰(Decoration)、Widget 架构(代码注释)、Web Worker 语法高亮、优化选择。可直接解析 `git diff` 输出，与 gix 后端天然契合 |
| 简单文本对比备选 | **react-diff-viewer-continued** | 基于 jsdiff 的文本差异组件，GitHub 风格，支持 Split/Inline、单词级差异、行高亮。适合非 Git diff 格式的简单文本对比场景 |

#### 代码查看与编辑

| 功能域 | 组件库 | 说明 |
|--------|--------|------|
| 代码查看/Blame | **@monaco-editor/react** | Monaco Editor React 封装，用于 Blame 视图、提交信息编辑、冲突解决编辑器。支持语法高亮、行装饰、只读模式、diff 编辑器模式 |
| 轻量代码高亮备选 | **shiki** | 若 Monaco 体积过大，可用 Shiki 做纯语法高亮渲染，体积更小 |

#### 文件树与列表

| 功能域 | 组件库 | 说明 |
|--------|--------|------|
| 文件树 | **react-arborist** | 虚拟化文件树组件，支持拖拽排序、内联编辑、多选、搜索过滤、懒加载。API 简洁，适合 Git 仓库文件浏览 |
| 虚拟滚动列表 | **@tanstack/react-virtual** | 提交历史列表、文件变更列表等大数据量场景的虚拟滚动。轻量无头库，与 shadcn/ui 组合使用，支持动态行高、无限滚动 |

#### 终端

| 功能域 | 组件库 | 说明 |
|--------|--------|------|
| 内置终端 | **@xterm/xterm** | VSCode 同款终端模拟器，支持 Canvas/WebGL 渲染、Unicode、ANSI 转义序列、插件系统(fit/search/web-links)。配合 Tauri 后端 PTY 实现完整终端体验 |

#### 交互增强

| 功能域 | 组件库 | 说明 |
|--------|--------|------|
| 键盘快捷键 | **react-hotkeys-hook** | React 快捷键 Hook，支持组合键、作用域、输入框忽略、自定义修饰键映射。轻量(3KB)，TypeScript 支持，API 简洁 |
| 拖放操作 | **@dnd-kit/core + @dnd-kit/sortable** | 现代化拖放库，无障碍访问支持，支持排序、多容器拖放。用于分支排序、文件暂存拖放等场景 |

#### 组件库选型总结

```
┌─────────────────────────────────────────────────────────────┐
│                    组件库分层架构                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  基础层 (shadcn/ui + react-resizable-panels + lucide-react) │
│  ├── Button, Dialog, Dropdown, ContextMenu, Tabs, Toast    │
│  ├── Command, Tooltip, Popover, Select, Checkbox           │
│  └── ResizablePanel, ResizableHandle                       │
│                                                             │
│  功能层 (按需引入)                                           │
│  ├── 提交图: @gitgraph/react                                │
│  ├── Diff:   react-diff-view                                │
│  ├── 代码:   @monaco-editor/react                           │
│  ├── 文件树: react-arborist                                  │
│  ├── 虚拟化: @tanstack/react-virtual                        │
│  ├── 终端:   @xterm/xterm                                   │
│  ├── 快捷键: react-hotkeys-hook                             │
│  └── 拖放:   @dnd-kit/core                                  │
│                                                             │
│  备选层 (性能降级方案)                                       │
│  ├── 大规模图: @antv/g6 (替代 @gitgraph/react)              │
│  ├── 简单对比: react-diff-viewer-continued (替代 diff-view) │
│  └── 轻量高亮: shiki (替代 monaco-editor)                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 后端 (Rust)

| 包名 | 用途 |
|------|------|
| tauri, tauri-build | 桌面框架 |
| gix | Git 操作核心库（gitoxide 纯 Rust 实现） |
| serde, serde_json | 序列化 |
| tokio | 异步运行时 |
| anyhow / thiserror | 错误处理 |
| sled 或 rusqlite | 本地存储 |
| which | 检测系统 Git |

---

## 六、风险与应对

| 风险 | 影响 | 应对策略 |
|------|------|----------|
| gix 对部分 porcelain 操作支持不完整 | 高级功能无法实现 | 回退到 Git CLI 实现 |
| 大型仓库性能问题 | 用户体验差 | gix 并行处理 + 虚拟滚动 + 增量加载 |
| DAG 图渲染性能 | 提交图卡顿 | Canvas/WebGL 渲染 + 抽象简化 |
| SSH 认证兼容性 | 无法连接远程仓库 | gix 内置 SSH 支持 + 复用系统 SSH agent |
| gix API 快速迭代 | 升级成本 | 锁定版本 + 抽象层隔离 |

---

## 七、里程碑跟踪

| 阶段 | 状态 | 关键交付 |
|------|------|----------|
| 阶段 0：项目基础搭建 | **进行中 (90%)** | 可运行空壳应用，前后端通信正常 |
| 阶段 1：仓库管理核心 | 待开始 | 打开仓库 + 提交 |
| 阶段 2：提交历史与分支 | 待开始 | DAG 图 + 分支管理 |
| 阶段 3：高级 Git 操作 | 待开始 | 合并/变基/冲突解决 |
| 阶段 4：搜索与增强 | 待开始 | 搜索 + Blame + LFS |
| 阶段 5：打磨与发布 | 待开始 | 稳定发布版 |
