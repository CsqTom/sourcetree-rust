/**
 * 仓库相关查询定义
 */

import { queryOptions } from '@tanstack/react-query'
import { tauriCommands } from '@/lib/tauri/commands'

/** 仓库查询键前缀 */
export const repoKeys = {
  all: ['repo'] as const,
  detail: (repoPath: string) => ['repo', repoPath] as const,
  summary: (repoPath: string) => ['repo', repoPath, 'summary'] as const,
  status: (repoPath: string) => ['repo', repoPath, 'status'] as const,
  commits: (repoPath: string) => ['repo', repoPath, 'commits'] as const,
  branches: (repoPath: string) => ['repo', repoPath, 'branches'] as const,
  tracking: (repoPath: string) => ['repo', repoPath, 'tracking'] as const,
  remotes: (repoPath: string) => ['repo', repoPath, 'remotes'] as const,
  diff: (repoPath: string, filePath: string) => ['repo', repoPath, 'diff', filePath] as const,
  stagedDiff: (repoPath: string, filePath: string) => ['repo', repoPath, 'stagedDiff', filePath] as const,
  commitFiles: (repoPath: string, commitId: string) => ['repo', repoPath, 'commitFiles', commitId] as const,
  commitFileDiff: (repoPath: string, commitId: string, filePath: string) => ['repo', repoPath, 'commitFileDiff', commitId, filePath] as const,
}

/** 仓库摘要查询 */
export const repoQueries = {
  summary: (repoPath: string) =>
    queryOptions({
      queryKey: repoKeys.summary(repoPath),
      queryFn: () => tauriCommands.getRepoSummary(repoPath),
      refetchInterval: 60_000,
    }),

  /** 文件状态查询 */
  status: (repoPath: string) =>
    queryOptions({
      queryKey: repoKeys.status(repoPath),
      queryFn: () => tauriCommands.getStatus(repoPath),
      refetchInterval: 30_000,
    }),

  /** 最近提交查询 */
  commits: (repoPath: string) =>
    queryOptions({
      queryKey: repoKeys.commits(repoPath),
      queryFn: () => tauriCommands.getRecentCommits(repoPath),
      refetchInterval: 60_000,
    }),

  /** 分支列表查询 */
  branches: (repoPath: string) =>
    queryOptions({
      queryKey: repoKeys.branches(repoPath),
      queryFn: () => tauriCommands.listBranches(repoPath),
    }),

  /** 分支追踪信息查询 */
  tracking: (repoPath: string) =>
    queryOptions({
      queryKey: repoKeys.tracking(repoPath),
      queryFn: () => tauriCommands.getBranchTracking(repoPath),
    }),

  /** 远程仓库列表查询 */
  remotes: (repoPath: string) =>
    queryOptions({
      queryKey: repoKeys.remotes(repoPath),
      queryFn: () => tauriCommands.listRemotes(repoPath),
    }),

  /** 工作区文件差异查询 */
  diff: (repoPath: string, filePath: string) =>
    queryOptions({
      queryKey: repoKeys.diff(repoPath, filePath),
      queryFn: () => tauriCommands.getFileDiff(repoPath, filePath),
    }),

  /** 已暂存文件差异查询 */
  stagedDiff: (repoPath: string, filePath: string) =>
    queryOptions({
      queryKey: repoKeys.stagedDiff(repoPath, filePath),
      queryFn: () => tauriCommands.getStagedDiff(repoPath, filePath),
    }),

  /** 提交文件列表查询 */
  commitFiles: (repoPath: string, commitId: string) =>
    queryOptions({
      queryKey: repoKeys.commitFiles(repoPath, commitId),
      queryFn: () => tauriCommands.getCommitFiles(repoPath, commitId),
    }),

  /** 提交文件差异查询 */
  commitFileDiff: (repoPath: string, commitId: string, filePath: string) =>
    queryOptions({
      queryKey: repoKeys.commitFileDiff(repoPath, commitId, filePath),
      queryFn: () => tauriCommands.getCommitFileDiff(repoPath, commitId, filePath),
    }),
}
