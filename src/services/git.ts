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

/** 引用信息（分支或标签） */
export interface RefInfo {
  /** 引用名（如 "main"、"v1.0"） */
  name: string;
  /** 引用类型：head（分支）、tag（轻量标签）、annotated_tag（附注标签） */
  kind: string;
}

export interface CommitEntry {
  id: string;
  message: string;
  author: string;
  author_email: string;
  time: number;
  /** 提交者名 */
  committer: string;
  /** 提交者邮箱 */
  committer_email: string;
  /** 父提交 ID 列表（用于 DAG 图） */
  parent_ids: string[];
  /** 关联引用列表 */
  refs: RefInfo[];
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

/** 获取更早的提交（分页加载） */
export async function getOlderCommits(
  repoPath: string,
  maxCount: number,
  offset: number,
): Promise<CommitEntry[]> {
  return invoke<CommitEntry[]>("get_older_commits", { repoPath, maxCount, offset });
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

// ===== 分支管理命令 =====

/** 创建分支 */
export async function createBranch(
  repoPath: string,
  branchName: string
): Promise<string> {
  return invoke<string>("create_branch", { repoPath, branchName });
}

/** 切换分支 */
export async function checkoutBranch(
  repoPath: string,
  branchName: string
): Promise<string> {
  return invoke<string>("checkout_branch", { repoPath, branchName });
}

/** 创建并切换到新分支 */
export async function checkoutNewBranch(
  repoPath: string,
  branchName: string
): Promise<string> {
  return invoke<string>("checkout_new_branch", { repoPath, branchName });
}

/** 删除分支 */
export async function deleteBranch(
  repoPath: string,
  branchName: string,
  force = false
): Promise<string> {
  return invoke<string>("delete_branch", { repoPath, branchName, force });
}

// ===== 远程操作命令 =====

/** Fetch 远程更新 */
export async function fetchRemote(
  repoPath: string,
  remote?: string
): Promise<string> {
  return invoke<string>("fetch_remote", { repoPath, remote });
}

/** Pull 拉取并合并 */
export async function pullRemote(
  repoPath: string,
  remote?: string,
  branch?: string
): Promise<string> {
  return invoke<string>("pull_remote", { repoPath, remote, branch });
}

/** Push 推送到远程 */
export async function pushRemote(
  repoPath: string,
  remote?: string,
  branch?: string,
  setUpstream = false
): Promise<string> {
  return invoke<string>("push_remote", { repoPath, remote, branch, setUpstream });
}

/** 克隆仓库 */
export async function cloneRepo(url: string, targetDir: string): Promise<string> {
  return invoke<string>("clone_repo", { url, targetDir });
}

/** 初始化仓库 */
export async function initRepo(path: string, bare = false): Promise<string> {
  return invoke<string>("init_repo", { path, bare });
}

/** 获取远程仓库列表 */
export async function listRemotes(
  repoPath: string
): Promise<{ name: string; fetch_url: string | null; push_url: string | null }[]> {
  return invoke("list_remotes", { repoPath });
}

/** 添加远程仓库 */
export async function addRemote(
  repoPath: string,
  name: string,
  url: string
): Promise<string> {
  return invoke<string>("add_remote", { repoPath, name, url });
}

/** 删除远程仓库 */
export async function removeRemote(
  repoPath: string,
  name: string
): Promise<string> {
  return invoke<string>("remove_remote", { repoPath, name });
}

/** 修改远程仓库 URL */
export async function setRemoteUrl(
  repoPath: string,
  name: string,
  url: string
): Promise<string> {
  return invoke<string>("set_remote_url", { repoPath, name, url });
}

// ===== 提交详情命令 =====

/** 获取单次提交的变更文件列表 */
export async function getCommitFiles(
  repoPath: string,
  commitId: string
): Promise<{ status: string; path: string }[]> {
  return invoke("get_commit_files", { repoPath, commitId });
}

/** 获取单次提交的差异 */
export async function getCommitDiff(
  repoPath: string,
  commitId: string
): Promise<string> {
  return invoke<string>("get_commit_diff", { repoPath, commitId });
}

/** 获取某次提交中单个文件的变更内容 */
export async function getCommitFileDiff(
  repoPath: string,
  commitId: string,
  filePath: string
): Promise<string> {
  return invoke<string>("get_commit_file_diff", { repoPath, commitId, filePath });
}