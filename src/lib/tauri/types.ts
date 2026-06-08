/**
 * Tauri IPC 类型定义
 *
 * 与 Rust 后端数据模型对齐的类型
 */

// ===== 文件状态 =====

export interface FileStatus {
  path: string
  worktree_status: string | null
  stage_status: string | null
  is_untracked: boolean
  is_ignored: boolean
}

// ===== 仓库摘要 =====

export interface RepoSummary {
  path: string
  current_branch: string
  remote_url: string | null
  unstaged_count: number
  staged_count: number
  untracked_count: number
  ahead: number
  behind: number
}

// ===== 引用信息 =====

export interface RefInfo {
  /** 引用名（如 "main"、"v1.0"） */
  name: string
  /** 引用类型：head（分支）、tag（轻量标签）、annotated_tag（附注标签） */
  kind: string
}

// ===== 提交条目 =====

export interface CommitEntry {
  id: string
  message: string
  author: string
  author_email: string
  time: number
  committer: string
  committer_email: string
  parent_ids: string[]
  refs: RefInfo[]
}

// ===== 分支追踪信息 =====

export interface BranchTrackingInfo {
  branch: string
  isCurrent: boolean
  upstream: string | null
  ahead: number
  behind: number
}

// ===== 远程仓库 =====

export interface RemoteInfo {
  name: string
  fetch_url: string | null
  push_url: string | null
}

// ===== 提交文件变更 =====

export interface CommitFileChange {
  status: string
  path: string
}

// ===== 行选择 =====

export interface LineSelection {
  hunkIndex: number
  lineIndices: number[]
}
