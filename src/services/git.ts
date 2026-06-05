/**
 * Tauri IPC 调用层
 *
 * 封装前端与 Rust 后端的通信接口
 */

import { invoke } from "@tauri-apps/api/core";

// ===== 数据模型（匹配 Rust 端） =====

export interface FileStatus {
  path: string;
  worktree_status: string | null;
  stage_status: string | null;
  is_untracked: boolean;
  is_ignored: boolean;
}

export interface RepoSummary {
  path: string;
  current_branch: string;
  remote_url: string | null;
  unstaged_count: number;
  staged_count: number;
  untracked_count: number;
  ahead: number;
  behind: number;
}

export interface CommitEntry {
  id: string;
  message: string;
  author: string;
  author_email: string;
  time: number;
  ref_names: string[];
}

// ===== 基础命令 =====

/** 基础问候测试 */
export async function greet(name: string): Promise<string> {
  return invoke<string>("greet", { name });
}

/** 获取后端状态 */
export async function getBackendInfo(): Promise<{
  status: string;
  gix_available: boolean;
}> {
  return invoke("get_backend_info");
}

// ===== 仓库命令 =====

/** 打开仓库 */
export async function openRepo(path: string): Promise<string> {
  return invoke<string>("open_repo", { path });
}

/** 获取仓库信息 */
export async function getRepoInfo(): Promise<{
  is_open: boolean;
  current_path: string | null;
  theme: string;
}> {
  return invoke("get_repo_info");
}

/** 获取仓库摘要信息 */
export async function getRepoSummary(repoPath: string): Promise<RepoSummary> {
  return invoke<RepoSummary>("get_repo_summary", { repoPath });
}

/** 验证路径是否为有效的 Git 仓库 */
export async function validateRepoPath(
  path: string
): Promise<{ valid: boolean; error: string | null }> {
  const result = await invoke<{
    valid: boolean;
    is_bare?: boolean;
    error: string | null;
  }>("validate_repo_path", { path });
  return { valid: result.valid, error: result.error };
}

// ===== 文件状态命令 =====

/** 获取文件状态列表 */
export async function getStatus(repoPath: string): Promise<FileStatus[]> {
  return invoke<FileStatus[]>("get_status", { repoPath });
}

/** 暂存文件 */
export async function stageFiles(
  repoPath: string,
  paths: string[]
): Promise<string> {
  return invoke<string>("stage_files", { repoPath, paths });
}

/** 取消暂存 */
export async function unstageFiles(
  repoPath: string,
  paths: string[]
): Promise<string> {
  return invoke<string>("unstage_files", { repoPath, paths });
}

/** 获取文件差异 */
export async function getFileDiff(
  repoPath: string,
  filePath: string
): Promise<string> {
  return invoke<string>("get_file_diff", { repoPath, filePath });
}

// ===== 提交命令 =====

/** 提交变更 */
export async function commitChanges(
  repoPath: string,
  message: string
): Promise<string> {
  return invoke<string>("commit_changes", { repoPath, message });
}

/** 获取最近提交 */
export async function getRecentCommits(
  repoPath: string
): Promise<CommitEntry[]> {
  return invoke<CommitEntry[]>("get_recent_commits", { repoPath });
}

// ===== 分支命令 =====

/** 获取分支列表 */
export async function listBranches(repoPath: string): Promise<string[]> {
  return invoke<string[]>("list_branches", { repoPath });
}

/** 获取当前分支名 */
export async function getCurrentBranch(
  repoPath: string
): Promise<string> {
  return invoke<string>("get_current_branch", { repoPath });
}