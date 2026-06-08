/**
 * Tauri IPC 类型安全调用层
 *
 * 封装所有 invoke 调用，提供编译期类型检查
 */

import { invoke } from '@tauri-apps/api/core'
import type {
  FileStatus,
  RepoSummary,
  CommitEntry,
  BranchTrackingInfo,
  RemoteInfo,
  CommitFileChange,
  LineSelection,
} from './types'

// ===== 基础命令 =====

export const tauriCommands = {
  /** 基础问候测试 */
  greet: (name: string) =>
    invoke<string>('greet', { name }),

  /** 获取后端状态 */
  getBackendInfo: () =>
    invoke<{ status: string; gix_available: boolean }>('get_backend_info'),

  // ===== 仓库命令 =====

  /** 打开仓库 */
  openRepo: (path: string) =>
    invoke<string>('open_repo', { path }),

  /** 获取仓库信息 */
  getRepoInfo: () =>
    invoke<{ is_open: boolean; current_path: string | null; theme: string }>('get_repo_info'),

  /** 获取仓库摘要信息 */
  getRepoSummary: (repoPath: string) =>
    invoke<RepoSummary>('get_repo_summary', { repoPath }),

  /** 验证路径是否为有效的 Git 仓库 */
  validateRepoPath: (path: string) =>
    invoke<{ valid: boolean; is_bare?: boolean; error: string | null }>('validate_repo_path', { path }),

  // ===== 文件状态命令 =====

  /** 获取文件状态列表 */
  getStatus: (repoPath: string) =>
    invoke<FileStatus[]>('get_status', { repoPath }),

  /** 暂存文件 */
  stageFiles: (repoPath: string, paths: string[]) =>
    invoke<string>('stage_files', { repoPath, paths }),

  /** 取消暂存 */
  unstageFiles: (repoPath: string, paths: string[]) =>
    invoke<string>('unstage_files', { repoPath, paths }),

  /** 获取文件差异（工作区 vs 暂存区） */
  getFileDiff: (repoPath: string, filePath: string) =>
    invoke<string>('get_file_diff', { repoPath, filePath }),

  /** 获取已暂存文件的差异（HEAD vs 暂存区） */
  getStagedDiff: (repoPath: string, filePath: string) =>
    invoke<string>('get_staged_diff', { repoPath, filePath }),

  // ===== 提交命令 =====

  /** 提交变更 */
  commitChanges: (repoPath: string, message: string) =>
    invoke<string>('commit_changes', { repoPath, message }),

  /** 获取最近提交 */
  getRecentCommits: (repoPath: string) =>
    invoke<CommitEntry[]>('get_recent_commits', { repoPath }),

  /** 获取更早的提交（分页加载） */
  getOlderCommits: (repoPath: string, maxCount: number, offset: number) =>
    invoke<CommitEntry[]>('get_older_commits', { repoPath, maxCount, offset }),

  // ===== 分支命令 =====

  /** 获取分支列表 */
  listBranches: (repoPath: string) =>
    invoke<string[]>('list_branches', { repoPath }),

  /** 获取远程分支列表 */
  listRemoteBranches: (repoPath: string) =>
    invoke<string[]>('list_remote_branches', { repoPath }),

  /** 获取当前分支名 */
  getCurrentBranch: (repoPath: string) =>
    invoke<string>('get_current_branch', { repoPath }),

  /** 创建分支 */
  createBranch: (repoPath: string, branchName: string) =>
    invoke<string>('create_branch', { repoPath, branchName }),

  /** 切换分支 */
  checkoutBranch: (repoPath: string, branchName: string) =>
    invoke<string>('checkout_branch', { repoPath, branchName }),

  /** 创建并切换到新分支 */
  checkoutNewBranch: (repoPath: string, branchName: string) =>
    invoke<string>('checkout_new_branch', { repoPath, branchName }),

  /** 删除分支 */
  deleteBranch: (repoPath: string, branchName: string, force = false) =>
    invoke<string>('delete_branch', { repoPath, branchName, force }),

  /** 获取所有分支的追踪信息 */
  getBranchTracking: (repoPath: string) =>
    invoke<BranchTrackingInfo[]>('get_branch_tracking', { repoPath }),

  // ===== 远程操作命令 =====

  /** Fetch 远程更新 */
  fetchRemote: (repoPath: string, remote?: string) =>
    invoke<string>('fetch_remote', { repoPath, remote }),

  /** Pull 拉取并合并 */
  pullRemote: (repoPath: string, remote?: string, branch?: string) =>
    invoke<string>('pull_remote', { repoPath, remote, branch }),

  /** Push 推送到远程 */
  pushRemote: (repoPath: string, remote?: string, branch?: string, setUpstream = false) =>
    invoke<string>('push_remote', { repoPath, remote, branch, setUpstream }),

  /** 克隆仓库 */
  cloneRepo: (url: string, targetDir: string) =>
    invoke<string>('clone_repo', { url, targetDir }),

  /** 初始化仓库 */
  initRepo: (path: string, bare = false) =>
    invoke<string>('init_repo', { path, bare }),

  /** 获取远程仓库列表 */
  listRemotes: (repoPath: string) =>
    invoke<RemoteInfo[]>('list_remotes', { repoPath }),

  /** 添加远程仓库 */
  addRemote: (repoPath: string, name: string, url: string) =>
    invoke<string>('add_remote', { repoPath, name, url }),

  /** 删除远程仓库 */
  removeRemote: (repoPath: string, name: string) =>
    invoke<string>('remove_remote', { repoPath, name }),

  /** 修改远程仓库 URL */
  setRemoteUrl: (repoPath: string, name: string, url: string) =>
    invoke<string>('set_remote_url', { repoPath, name, url }),

  // ===== 提交详情命令 =====

  /** 获取单次提交的变更文件列表 */
  getCommitFiles: (repoPath: string, commitId: string) =>
    invoke<CommitFileChange[]>('get_commit_files', { repoPath, commitId }),

  /** 获取单次提交的差异 */
  getCommitDiff: (repoPath: string, commitId: string) =>
    invoke<string>('get_commit_diff', { repoPath, commitId }),

  /** 获取某次提交中单个文件的变更内容 */
  getCommitFileDiff: (repoPath: string, commitId: string, filePath: string) =>
    invoke<string>('get_commit_file_diff', { repoPath, commitId, filePath }),

  // ===== 丢弃更改和暂存 hunk 命令 =====

  /** 暂存指定 hunk 的更改 */
  stageHunk: (repoPath: string, filePath: string, hunkIndex: number) =>
    invoke<string>('stage_hunk', { repoPath, filePath, hunkIndex }),

  /** 丢弃文件的所有更改 */
  discardFile: (repoPath: string, filePath: string) =>
    invoke<string>('discard_file', { repoPath, filePath }),

  /** 丢弃指定 hunk 的更改 */
  discardHunk: (repoPath: string, filePath: string, hunkIndex: number) =>
    invoke<string>('discard_hunk', { repoPath, filePath, hunkIndex }),

  /** 丢弃指定行的更改 */
  discardLines: (repoPath: string, filePath: string, startLine: number, endLine: number) =>
    invoke<string>('discard_lines', { repoPath, filePath, startLine, endLine }),

  /** 读取工作区文件内容 */
  readWorkingFile: (repoPath: string, filePath: string) =>
    invoke<string>('read_working_file', { repoPath, filePath }),

  /** 写入工作区文件内容 */
  writeWorkingFile: (repoPath: string, filePath: string, content: string) =>
    invoke<string>('write_working_file', { repoPath, filePath, content }),

  /** 暂存选中的行 */
  stageLines: (repoPath: string, filePath: string, selections: LineSelection[]) =>
    invoke<string>('stage_lines', { repoPath, filePath, selections }),

  /** 丢弃选中的行 */
  discardLinesByIndices: (repoPath: string, filePath: string, selections: LineSelection[]) =>
    invoke<string>('discard_lines_by_indices', { repoPath, filePath, selections }),

  /** 取消暂存选中的行 */
  unstageLines: (repoPath: string, filePath: string, selections: LineSelection[]) =>
    invoke<string>('unstage_lines', { repoPath, filePath, selections }),

  // ===== 标签管理命令 =====

  /** 创建轻量标签 */
  createLightweightTag: (repoPath: string, name: string, commitId?: string | null) =>
    invoke<string>('create_lightweight_tag', { repoPath, name, commitId: commitId ?? null }),

  /** 创建附注标签 */
  createAnnotatedTag: (repoPath: string, name: string, message: string, commitId?: string | null) =>
    invoke<string>('create_annotated_tag', { repoPath, name, message, commitId: commitId ?? null }),

  /** 删除本地标签 */
  deleteTag: (repoPath: string, name: string) =>
    invoke<string>('delete_tag', { repoPath, name }),

  /** 推送标签到远程 */
  pushTag: (repoPath: string, name: string, remote?: string | null) =>
    invoke<string>('push_tag', { repoPath, name, remote: remote ?? null }),

  /** 删除远程标签 */
  deleteRemoteTag: (repoPath: string, name: string, remote?: string | null) =>
    invoke<string>('delete_remote_tag', { repoPath, name, remote: remote ?? null }),

  /** 列出所有标签 */
  listTags: (repoPath: string) =>
    invoke<string[]>('list_tags', { repoPath }),
} as const
